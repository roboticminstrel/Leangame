// The first screen's Natural Number Game (src/Home.js): what it shows for each state of the Lean machine
import test from 'node:test';
import assert from 'node:assert/strict';
import { nngView, NNG_URL, NNG_HOSTED_URL } from '../src/Home.js';

test('the Natural Number Game: wait while the machine and the game server get ready, then frame our own', () => {
  assert.ok(nngView({ state: 'asleep' }).busy);
  assert.equal(nngView({ state: 'booting', detail: 'Unpacking Lean' }).wait, 'Unpacking Lean');
  const building = nngView({ state: 'ready', nng: { state: 'building', detail: 'Building the Natural Number Game (Lean and Mathlib)' } });
  assert.equal(building.wait, 'Building the Natural Number Game (Lean and Mathlib)');
  assert.ok(building.busy && building.fallback && !building.frame);
  assert.equal(nngView({ state: 'ready', nng: { state: 'ready' } }).frame, NNG_URL);
  const failed = nngView({ state: 'ready', nng: { state: 'failed', detail: 'The Natural Number Game did not build' } });
  assert.ok(failed.bad && failed.fallback && !failed.busy);
  assert.ok(nngView({ state: 'capped', detail: 'Lean has started 30 times today' }).bad);
});

test('the hosted version: when the gate does not know the game yet, or when chosen', () => {
  assert.equal(nngView({ state: 'ready' }).frame, NNG_HOSTED_URL, 'a gate from before the game: no nng field');
  assert.equal(nngView({ state: 'booting' }, true).frame, NNG_HOSTED_URL);
  assert.ok(!nngView({ state: 'ready', nng: null }).frame, 'a machine without the game: wait for the next start');
});
