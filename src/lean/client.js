// The Lean machine, from the browser (PROTOTYPE, written by Claude). lean.interlinea.io/api/lean/* reaches the gate
// Lambda (Interlinea-proto, infra/lean_gate/gate.py), which launches the machine and forwards moves to it.
//
//   wake()   Play: start the machine if it's asleep, then poll until Lean is ready
//   touch()  the player did something: keeps the machine from shutting down (at most once a minute)
//   check(lhs, rhs, rule)  ask Lean whether one board move is valid (trees: server/render.py)
//
// The machine shuts itself down after 10 minutes with no touch or check, so the page touches on every
// interaction while Lean is up, and notices (through a slow status poll) when it has gone to sleep.

const POLL_MS = 3000;          // while starting
const WATCH_MS = 60000;        // while ready: has it gone to sleep?
const TOUCH_MS = 60000;        // at most one touch a minute
const GIVE_UP_MS = 20 * 60000; // a first boot builds Lean (~10 min); past this, say something's wrong

export function createLean({ fetch = globalThis.fetch.bind(globalThis), base = '/api/lean', onChange = () => {},
  setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, now = Date.now } = {}) {
  let status = { state: 'asleep' };
  let timer = null;
  let lastTouch = 0;
  let wokeAt = 0;

  const set = (s) => { status = s; onChange(s); };

  async function call(method, path, body) {
    let r;
    try {
      r = await fetch(base + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      return { state: 'offline', detail: 'Can’t reach the server' };
    }
    const type = r.headers.get('content-type') || '';
    if (!type.includes('json')) return { state: 'offline', detail: 'The Lean server isn’t set up yet' };
    const j = await r.json();
    return r.ok || j.state ? j : { state: 'error', detail: j.error || `HTTP ${r.status}` };
  }

  function schedule(ms, fn) {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  }

  async function poll() {
    const s = await call('GET', '/status');
    if (s.state === 'ready') {
      set(s);
      schedule(WATCH_MS, poll);
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

  return { wake, touch, check, poll, get status() { return status; }, stop: () => clearTimeout(timer) };
}
