// The Lean client's flow (src/lean/client.js) against a fake gate: wake, poll until ready, touch, sleep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLean } from '../src/lean/client.js';

function fakeGate(answers) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push(`${opts.method} ${url}`);
    const key = `${opts.method} ${url.replace('/api/lean', '')}`;
    const q = answers[key];
    const body = Array.isArray(q) ? (q.length > 1 ? q.shift() : q[0]) : q;
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
  };
  return { fetch, calls };
}

function clock() {
  let t = 0, pending = null;
  return {
    now: () => t,
    setTimeout: (fn, ms) => { pending = { fn, at: t + ms }; return 1; },
    clearTimeout: () => { pending = null; },
    async run() { const p = pending; pending = null; t = p.at; await p.fn(); },
    get pending() { return pending; },
  };
}

test('wake polls until ready, then watches slowly', async () => {
  const c = clock();
  const g = fakeGate({
    'POST /wake': { state: 'starting' },
    'GET /status': [{ state: 'booting', detail: 'Unpacking Lean' }, { state: 'ready', idle_limit: 600 }],
  });
  const seen = [];
  const lean = createLean({ fetch: g.fetch, onChange: (s) => seen.push(s.state), ...c });
  await lean.wake();
  assert.equal(lean.status.state, 'starting');
  assert.equal(c.pending.at, 3000);
  await c.run();
  assert.equal(lean.status.state, 'booting');
  await c.run();
  assert.equal(lean.status.state, 'ready');
  assert.equal(c.pending.at - c.now(), 60000); // slow watch once ready
  assert.deepEqual(seen, ['starting', 'starting', 'booting', 'ready']);
});

test('touches at most once a minute, only while ready', async () => {
  const c = clock();
  const g = fakeGate({ 'POST /wake': { state: 'ready' }, 'GET /status': { state: 'ready' }, 'POST /touch': { ok: true } });
  const lean = createLean({ fetch: g.fetch, ...c });
  assert.equal(lean.touch(), false); // asleep: nothing to keep awake
  await lean.wake();
  assert.equal(lean.touch(), false); // just woke, and waking counts as activity
  await c.run();                     // a minute passes (the slow status watch)
  assert.equal(lean.touch(), true);
  assert.equal(lean.touch(), false);
  assert.equal(g.calls.filter((x) => x === 'POST /api/lean/touch').length, 1);
});

test('notices the machine went to sleep', async () => {
  const c = clock();
  const g = fakeGate({ 'POST /wake': { state: 'ready' }, 'GET /status': { state: 'asleep' } });
  const lean = createLean({ fetch: g.fetch, ...c });
  await lean.wake();
  await c.run();
  assert.equal(lean.status.state, 'asleep');
  assert.equal(c.pending, null);
});

test('a page without the API (local server) says offline', async () => {
  const fetch = async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) });
  const lean = createLean({ fetch, ...clock() });
  await lean.wake();
  assert.equal(lean.status.state, 'offline');
});

test('gives up on a boot that takes too long', async () => {
  const c = clock();
  const g = fakeGate({ 'POST /wake': { state: 'starting' }, 'GET /status': { state: 'booting' } });
  const lean = createLean({ fetch: g.fetch, ...c });
  await lean.wake();
  for (let i = 0; i < 401 && c.pending; i++) await c.run();
  assert.equal(lean.status.state, 'error');
});

test('live proof: starts when Lean is ready, replays the moves made before, then sends each new one', async () => {
  const c = clock();
  const bodies = [];
  const fetch = async (url, opts) => {
    const b = opts.body ? JSON.parse(opts.body) : null;
    let out = { state: 'ready' };
    if (url.endsWith('/check')) {
      bodies.push(b);
      out = b.session === 'start' ? { ok: true, sid: 's1', theorem: 'theorem level1 …', goals: ['⊢ 0 • v = 0'] }
        : b.to.zero ? { ok: true, goals: [], done: true, verified: true } : { ok: true, goals: ['⊢ next = 0'], done: false };
    }
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => out };
  };
  const lean = createLean({ fetch, ...c });
  lean.setLevel({ a: 0 }, { zero: true });
  lean.boardChanged({ a: 0 }, { a: 1 }, ['add_zero']);       // made while Lean is asleep
  assert.equal(bodies.length, 0);
  await lean.wake();                                            // answers ready
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(bodies.map(b => b.session), ['start', 'step'], 'started, then replayed the earlier move');
  assert.deepEqual(lean.live.goals, ['⊢ next = 0']);
  lean.boardChanged({ a: 1 }, { zero: true }, null);
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  assert.equal(lean.live.done, true);
  assert.equal(lean.live.verified, true);
  assert.equal(lean.live.steps.length, 2);
});

test('a status check that fails in transit is retried; only several in a row mean offline', async () => {
  const c = clock();
  let n = 0;
  const fetch = async (url, opts) => {
    if (url.endsWith('/wake')) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ state: 'ready' }) };
    n++;
    if (n === 1) throw new Error('network');                                                   // the phone blinked
    if (n === 2) return { ok: false, status: 504, headers: { get: () => 'text/html' }, json: async () => ({}) }; // gateway timeout
    if (n === 3) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ state: 'ready' }) };
    throw new Error('network');
  };
  const lean = createLean({ fetch, ...c });
  await lean.wake();
  await c.run(); assert.equal(lean.status.state, 'ready', 'one failure: still ready, trying again');
  await c.run(); assert.equal(lean.status.state, 'ready');
  await c.run(); assert.equal(lean.status.state, 'ready', 'answered: carries on');
  for (let i = 0; i < 4; i++) await c.run();
  assert.equal(lean.status.state, 'offline', 'four failures in a row: offline');
});

test('a start is timed phase by phase (from the status the gate shows), and the last one is kept', async () => {
  const c = clock();
  const g = fakeGate({
    'POST /wake': { state: 'starting', up_seconds: 0 },
    'GET /status': [
      { state: 'starting', up_seconds: 3 },
      { state: 'booting', detail: 'Installing tools', up_seconds: 40 },
      { state: 'booting', detail: 'Installing tools', up_seconds: 43 },
      { state: 'booting', detail: 'Unpacking Lean', up_seconds: 100 },
      { state: 'booting', detail: 'Loading Lean', up_seconds: 130 },
      { state: 'ready', up_seconds: 136, idle_limit: 600 },
    ],
  });
  let kept = null;
  const storage = { get: () => null, set: (v) => { kept = v; } };
  const boots = [];
  const lean = createLean({ fetch: g.fetch, storage, onChange: (s, live, boot) => boots.push(boot), ...c });
  await lean.wake();
  for (let i = 0; i < 6; i++) await c.run();
  assert.equal(lean.status.state, 'ready');
  assert.deepEqual(lean.boot.phases, [
    { label: 'Starting a machine', s: 40 }, { label: 'Installing tools', s: 60 }, { label: 'Unpacking Lean', s: 30 }, { label: 'Loading Lean', s: 6 }]);
  assert.equal(lean.boot.total, 136);
  assert.deepEqual(kept, lean.boot, 'kept for next time');
  assert.deepEqual(boots[boots.length - 1], lean.boot, 'listeners get it too');
  // a page opened later shows the last start
  assert.deepEqual(createLean({ fetch: g.fetch, storage: { get: () => kept, set: () => {} }, ...clock() }).boot, kept);
});
