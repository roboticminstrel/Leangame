// The Lean machine, from the browser (PROTOTYPE, written by Claude). lean.interlinea.io/api/lean/* reaches the gate
// Lambda (Interlinea-proto, infra/lean_gate/gate.py), which launches the machine and forwards moves to it.
//
//   wake()   Play: start the machine if it's asleep, then poll until Lean is ready
//   touch()  the player did something: keeps the machine from shutting down (at most once a minute)
//   check(lhs, rhs, rule)  ask Lean whether one board move is valid (trees: server/render.py)
//   setLevel(start, goal)   the level being played: a live proof of start = goal runs on the machine (the Lean tab)
//   boardChanged(from, to, hint)  a finished move; once Lean is ready each one becomes a step of that proof, and the
//                           moves made before Lean was ready are replayed when it is
//
// The machine shuts itself down after 10 minutes with no touch or check, so the page touches on every
// interaction while Lean is up, and notices (through a slow status poll) when it has gone to sleep.

const POLL_MS = 3000;          // while starting
const WATCH_MS = 60000;        // while ready: has it gone to sleep?
const TOUCH_MS = 60000;        // at most one touch a minute
const GIVE_UP_MS = 20 * 60000; // a first boot builds Lean (~10 min); past this, say something's wrong
const RETRY_MS = 5000;         // a request that failed in transit: try again this much later (times the tries)
const TRIES = 4;               // this many failures in a row before saying Lean can't be reached

// The last start's timings are kept in the browser (storage: get/set; localStorage by default).
const BOOT_KEY = 'leangame.leanBoot.v1';
const browserStorage = {
  get: () => { try { return JSON.parse(globalThis.localStorage.getItem(BOOT_KEY) || 'null'); } catch (e) { return null; } },
  set: (v) => { try { globalThis.localStorage.setItem(BOOT_KEY, JSON.stringify(v)); } catch (e) { /* not kept */ } },
};

export function createLean({ fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null, base = '/api/lean', onChange = () => {},
  setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, now = Date.now, storage = browserStorage } = {}) {
  let status = { state: 'asleep' };
  let timer = null;
  let lastTouch = 0;
  let wokeAt = 0;
  let fails = 0;             // status checks that failed in transit, in a row
  let stalled = false;       // a step didn't get through: send it again with the next status check
  // How long a start takes, phase by phase (what the boot script is doing, as the status shows it every few seconds):
  // [{ label, at }] with `at` the machine's age in seconds (or the time since Play) when the phase was first seen
  let bootLog = null;
  let lastBoot = storage ? storage.get() : null;   // { total, phases: [{ label, s }], when }
  const listeners = new Set([onChange]);
  const notify = () => listeners.forEach((fn) => fn(status, live, lastBoot));

  // The live proof, as the Lean tab shows it
  let level = null;          // { start, goal }
  let history = [];          // finished moves: { from, to, hint }
  let live = { state: 'idle', theorem: '', steps: [], goals: [], error: null, done: false, verified: null };
  let sid = null;
  let sent = 0;              // how many of history Lean has seen
  let queue = Promise.resolve();
  const setLive = (patch) => { live = Object.assign({}, live, patch); notify(); };

  // note the phase a status shows; at ready, the start's timings are done
  const track = (s) => {
    const at = s.up_seconds != null ? s.up_seconds : (now() - wokeAt) / 1000;
    if (s.state === 'starting' || s.state === 'booting') {
      const label = s.state === 'starting' ? 'Starting a machine' : (s.detail || s.phase || 'Booting');
      if (!bootLog) bootLog = [];
      if (!bootLog.length || bootLog[bootLog.length - 1].label !== label) bootLog.push({ label, at });
    } else if (s.state === 'ready' && bootLog && bootLog.length) {
      const pts = bootLog.concat([{ label: 'ready', at }]);
      const phases = pts.slice(0, -1).map((p, i) => ({ label: p.label, s: Math.max(0, Math.round(pts[i + 1].at - p.at)) }));
      lastBoot = { total: Math.round(at), phases, when: new Date(now()).toISOString() };
      if (storage) storage.set(lastBoot);
      bootLog = null;
    } else if (s.state !== 'ready') bootLog = null;
  };
  const set = (s) => {
    track(s);
    const wasReady = status.state === 'ready';
    status = s; notify();
    if (s.state === 'ready' && !wasReady) beginLive();
    if (s.state !== 'ready' && wasReady) { sid = null; setLive({ state: 'idle' }); }
  };

  async function call(method, path, body) {
    let r;
    try {
      r = await fetch(base + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      return { state: 'offline', transient: true, detail: 'Can’t reach the server' };
    }
    const type = r.headers.get('content-type') || '';
    // a gateway timing out or briefly failing (5xx): worth another try, not the end of Lean
    if (r.status >= 500 && !type.includes('json')) return { state: 'offline', transient: true, detail: `HTTP ${r.status}` };
    if (!type.includes('json')) return { state: 'offline', detail: 'The Lean server isn’t set up yet' };
    let j;
    try { j = await r.json(); } catch (e) { return { state: 'offline', transient: true, detail: 'A reply Lean’s gate couldn’t read' }; }
    if (r.status >= 500 && !j.state) return { state: 'offline', transient: true, detail: j.error || j.message || `HTTP ${r.status}` };
    return r.ok || j.state ? j : { state: 'error', detail: j.error || `HTTP ${r.status}` };
  }

  function schedule(ms, fn) {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  }

  async function poll() {
    const s = await call('GET', '/status');
    // one failed check (the phone's network, a gateway hiccup) doesn't end Lean: try again a few times first
    if (s.transient && ['ready', 'booting', 'starting'].includes(status.state) && fails < TRIES - 1) {
      fails++; schedule(RETRY_MS * fails, poll); return;
    }
    fails = 0;
    if (s.state === 'ready') {
      set(s);
      if (stalled && sid) { stalled = false; queue = queue.then(flush); }
      schedule(sent < history.length || stalled ? RETRY_MS : WATCH_MS, poll);
    } else if (s.state === 'starting' || s.state === 'booting') {
      if (now() - wokeAt > GIVE_UP_MS) return set({ ...s, state: 'error', detail: 'Lean is taking too long to start' });
      set(s);
      schedule(POLL_MS, poll);
    } else {
      set(s); // asleep (idle shutdown), offline, error
    }
  }

  async function wake() {
    wokeAt = now();
    lastTouch = now();
    set({ state: 'starting', detail: 'Waking Lean' });
    const s = await call('POST', '/wake');
    set(s);
    if (s.state === 'starting' || s.state === 'booting') schedule(POLL_MS, poll);
    else if (s.state === 'ready') schedule(WATCH_MS, poll);
    return s;
  }

  function touch() {
    if (status.state !== 'ready' || now() - lastTouch < TOUCH_MS) return false;
    lastTouch = now();
    call('POST', '/touch').then((s) => { if (s.state === 'asleep') set(s); });
    return true;
  }

  async function check(lhs, rhs, rule) {
    lastTouch = now(); // a check counts as activity on the machine too
    return call('POST', '/check', { lhs, rhs, rule });
  }

  // Start the live proof from the level's start, then send every move made so far, one at a time
  function beginLive() {
    if (!level) return;
    sid = null; sent = 0;
    setLive({ state: 'starting', theorem: '', steps: [], goals: [], error: null, done: false, verified: null });
    queue = queue.then(async () => {
      lastTouch = now();
      const r = await call('POST', '/check', Object.assign({ session: 'start', start: level.start, goal: level.goal, hyps: level.hyps || [] }, level.mem ? { mem: level.mem } : {}));
      if (!r.ok || !r.sid) { setLive({ state: 'error', error: r.error || r.detail || 'Lean couldn’t start the proof' }); return; }
      sid = r.sid;
      setLive({ state: 'live', theorem: r.theorem, goals: r.goals || [] });
      await flush();
    });
  }

  async function flush() {
    while (sid && sent < history.length) {
      const m = history[sent++];
      if (!(m.target && m.target.card) && (!m.from || !m.to || (Array.isArray(m.from) && !(m.from[0] && m.from[1] && m.to[0] && m.to[1])))) { setLive({ steps: live.steps.concat([{ ok: false, hint: m.hint, error: 'This position can’t be written in Lean yet' }]) }); continue; }
      lastTouch = now();
      const r = await call('POST', '/check', { session: 'step', sid, from: m.from, to: m.to, hint: m.hint || [], witness: m.witness || null, target: m.target || null, seq: sent - 1 });
      // didn't get through (the gate gave up waiting, the network failed): the next status check sends it again
      if (r.state === 'asleep' || r.state === 'booting' || r.transient) { sent--; stalled = true; schedule(RETRY_MS, poll); return; }
      if (r.error && /session ended/.test(r.error)) { beginLive(); return; }
      const stepRow = { ok: !!r.ok, hint: m.hint, error: r.ok ? null : r.error };
      if (r.ok) setLive({ steps: live.steps.concat([stepRow]), goals: r.goals || [], done: !!r.done, verified: r.done ? !!r.verified : null, error: null });
      else setLive({ steps: live.steps.concat([stepRow]), error: r.error });
    }
  }

  // mem: for a membership goal (start ∈ U), { ctx, mems, scalars, vectors } (server/render.py, mem_theorem)
  function setLevel(start, goal, hyps, mem) {
    level = { start, goal, hyps: hyps || [], mem: mem || null }; history = [];
    if (status.state === 'ready') beginLive();
  }

  // target: null for the expression, { goal: true } for a move on the goal, { hyp: 'h1', bind } for one on a
  // hypothesis (from/to are then [lhs, rhs])
  function boardChanged(from, to, hint, witness, target) {
    history.push({ from, to, hint, witness, target });
    if (sid) queue = queue.then(flush);
  }

  return { wake, touch, check, poll, setLevel, boardChanged, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    get status() { return status; }, get live() { return live; }, get boot() { return lastBoot; }, stop: () => clearTimeout(timer) };
}
