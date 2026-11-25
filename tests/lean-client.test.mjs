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
