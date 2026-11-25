// Logic tests for the Range. Run with: npm test  (node --test, no dependencies)
// The component is driven directly: no DOM, setState applied synchronously, gestures simulated in world units.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Range } from '../src/range/Range.js';

const SC = 390 / 560; // screen px per world unit at zoom 1 when no board has been measured

function make() {
  const c = new Range({});
  c.setState = function (o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); };
  c.renderVals();
  return c;
}
const ev = (x, y) => ({ clientX: x * SC, clientY: y * SC, preventDefault() {}, stopPropagation() {} });
const show = n => n.t === 's' || n.t === 'v' ? n.el
  : n.t === 'prod' ? n.factors.map(show).join('·') + (n.vec ? '·' + show(n.vec) : '')
  : '(' + n.terms.map(t => show(t.node)).join(' + ') + ')';
const zone = c => c.state.tops.filter(t => c.zoneIds.includes(t.node.id)).map(t => show(t.node));
const result = c => c.renderVals().results.map(r => r.main);
const byEl = (c, el) => { let f = null; c.state.tops.forEach(t => c.walk(t.node, n => { if (!f && n.el === el) f = n; }, null, null)); return f; };

// drag a piece so its centre lands on (tx, ty), in world units
function dragTo(c, id, tx, ty, role = 'self') {
  c.renderVals();
  const p = c.P.get(id);
  const dx = tx - (p.x + p.w / 2), dy = ty - (p.y + p.h / 2);
  c.begin(id, role, ev(0, 0));
  c.move(ev(dx / 2, dy / 2)); c.renderVals();
  c.move(ev(dx, dy)); c.renderVals();
  const preview = c.state.preview;
  c.end(); c.renderVals();
  return preview;
}

test('starting board evaluates to 4v', () => {
  const c = make();
  assert.deepEqual(result(c), ['= 4𝑣']);
});

test('sandbox: a scalar dropped on another scalar multiplies', () => {
  const c = make();
  const half = byEl(c, '½'); const two = c.state.tops.find(t => t.node.el === '2').node;
  c.renderVals(); const p2 = c.P.get(two.id);
  dragTo(c, half.id, p2.x - 96 + 22 + 48, p2.y + 44);
  const prod = c.state.tops.find(t => t.node.t === 'prod' && !t.node.vec);
  assert.ok(prod, 'a scalar product was formed');
  assert.equal(show(prod.node), '½·2');
});

test('sums take one type only: a complex scalar is refused by a real sum', () => {
  const c = make();
  const sum = c.state.tops[0].node.factors[0];
  c.renderVals(); const io = c.P.get(sum.id).io;
  dragTo(c, byEl(c, '𝑖').id, io.ix + io.iw / 2, io.iy + io.ih / 2 + 50);
  assert.equal(c.state.tops[0].node.factors[0].terms.length, 2);
  assert.match(c.state.flash.text, /only takes ℝ scalars/);
});

test('rules: reorder a scalar product by dragging sideways', () => {
  const c = make();
  c.state.tops = [{ node: c.mkProd([c.mkS('R', '½', '½'), c.mkS('R', '2', '2')], null), x: 20, y: 700 }];
  c.state.rules = true; c.renderVals();
  const first = c.state.tops[0].node.factors[0];
  c.begin(first.id, 'self', ev(0, 0)); c.move(ev(60, 0)); c.renderVals(); c.move(ev(120, 0)); c.renderVals(); c.end();
  assert.equal(show(c.state.tops[0].node), '2·½');
});

test('rules: distribute a scalar chain into a bracket from both sides', () => {
  const c = make();
  const g = c.mkSum([{ node: c.mkS('R', '3', '3'), x: 0, y: 0 }, { node: c.mkS('R', '4', '4'), x: 150, y: 0 }]);
  const two = c.mkS('R', '2', '2');
  c.state.tops = [{ node: c.mkProd([two, g, c.mkS('R', '5', '5')], null), x: 20, y: 620 }];
  c.state.rules = true; c.renderVals();
  const io = c.P.get(g.id).io;
  const pv = dragTo(c, two.id, io.ix + io.iw / 2, io.iy + io.ih / 2);
  assert.equal(pv.type, 'expand');
  assert.equal(show(c.state.tops[0].node), '(2·3·5 + 2·4·5)');
});

test('rules: distribute a scalar into a vector sum', () => {
  const c = make();
  const vs = c.mkSum([{ node: c.mkV('𝑉', '𝑣', 'v', 'R', 140), x: 0, y: 0 }, { node: c.mkV('𝑉', '𝑢', 'v', 'R', 140), x: 200, y: 0 }]);
  const half = c.mkS('R', '½', '½');
  c.state.tops = [{ node: c.mkProd([half], vs), x: 20, y: 620 }];
  c.state.rules = true; c.renderVals();
  const io = c.P.get(vs.id).io;
  dragTo(c, half.id, io.ix + io.iw / 2, io.iy + io.ih / 2);
  assert.equal(show(c.state.tops[0].node), '(½·𝑣 + ½·𝑢)');
});

test('rules: factor a common scalar out of the expression', () => {
  const c = make();
  const a2 = c.mkS('R', '2', '2'), b2 = c.mkS('R', '2', '2');
  c.state.tops = [
    { node: c.mkProd([a2, c.mkS('R', '3', '3')], c.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 20, y: 170 },
    { node: c.mkProd([b2, c.mkS('R', '5', '5')], c.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 20, y: 340 }];
  c.state.rules = true; c.renderVals();
  const pb = c.P.get(b2.id);
  const pv = dragTo(c, a2.id, pb.x + pb.w / 2, pb.y + pb.h / 2);
  assert.equal(pv.type, 'collect');
  assert.deepEqual(zone(c), ['2·(3·𝑣 + 5·𝑣)']);
  assert.deepEqual(result(c), ['= 8𝑣']);
});

test('rules: partial factoring extends the chain already outside the bracket', () => {
  const c = make();
  const t3a = c.mkS('R', '3', '3'), t3b = c.mkS('R', '3', '3');
  const S = c.mkSum([
    { node: c.mkProd([t3a, c.mkS('R', '4', '4')], c.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 0, y: 0 },
    { node: c.mkProd([t3b, c.mkS('R', '5', '5')], c.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 0, y: 130 }]);
  c.state.tops = [{ node: c.mkProd([c.mkS('R', '2', '2')], S), x: 20, y: 600 }];
  c.state.rules = true; c.renderVals();
  const pb = c.P.get(t3b.id);
  dragTo(c, t3a.id, pb.x + pb.w / 2, pb.y + pb.h / 2);
  assert.equal(show(c.state.tops[0].node), '2·3·(4·𝑣 + 5·𝑣)');
});

test('rules: a fully factored term becomes 1', () => {
  const c = make();
  const c2 = c.mkS('R', '2', '2'), d2 = c.mkS('R', '2', '2');
  c.state.tops = [{ node: c2, x: 30, y: 170 }, { node: c.mkProd([d2, c.mkS('R', '3', '3')], null), x: 30, y: 340 }];
  c.state.rules = true; c.renderVals();
  const pb = c.P.get(d2.id);
  dragTo(c, c2.id, pb.x + pb.w / 2, pb.y + pb.h / 2);
  assert.deepEqual(zone(c), ['2·(1 + 3)']);
  assert.deepEqual(result(c), ['= 8']);
});

test('rules: factor a vector out, then pull the bracket off to distribute it back', () => {
  const c = make();
  c.state.rules = true; c.renderVals();
  const v1 = c.state.tops[0].node.vec, v2 = c.state.tops[1].node.vec;
  const p2 = c.P.get(v2.id);
  const pv = dragTo(c, v1.id, p2.x + p2.w / 2, p2.y + p2.h / 2);
  assert.equal(pv.type, 'collectV');
  assert.deepEqual(zone(c), ['(2 + 3 + −1)·𝑣'], 'nested sums flatten');
  assert.deepEqual(result(c), ['= 4𝑣']);
  // pull the scalar bracket up off the vector
  const top = c.state.tops.find(t => c.zoneIds.includes(t.node.id));
  const G = top.node.factors[0];
  c.renderVals();
  c.begin(G.id, 'bit', ev(0, 0)); c.move(ev(-10, -60)); c.renderVals(); c.move(ev(-20, -120)); c.renderVals();
  assert.equal(c.state.preview.type, 'expandV');
  c.end(); c.renderVals();
  assert.deepEqual(zone(c), ['2·𝑣', '3·𝑣', '−1·𝑣']);
  assert.deepEqual(result(c), ['= 4𝑣']);
});

test('a short pull on a bracket does not distribute', () => {
  const c = make();
  c.state.rules = true; c.renderVals();
  const G = c.state.tops[0].node.factors[0];
  c.begin(G.id, 'bit', ev(0, 0)); c.move(ev(0, -20)); c.renderVals(); c.move(ev(0, -30)); c.renderVals();
  assert.equal(c.state.preview, null);
  c.end();
});

test('plus signs sit in the gap between nearest edges', () => {
  const c = make();
  const out = [];
  c.plusesFor([{ x: 0, y: 200, w: 500, h: 120 }, { x: 400, y: 40, w: 182, h: 88 }], 1, 'zone', out);
  assert.equal(out.length, 1);
  assert.equal(out[0].x + 19, 450);
  assert.equal(out[0].y + 19, 164);
});

test('a bracket inside a sum collapses into it', () => {
  const c = make();
  const g = c.mkSum([{ node: c.mkS('R', '2', '2'), x: 0, y: 0 }, { node: c.mkS('R', '3', '3'), x: 150, y: 0 }]);
  const tops = c.normTops([{ node: g, x: 20, y: 200 }, { node: c.mkS('R', '5', '5'), x: 400, y: 200 }]);
  assert.deepEqual(tops.map(t => show(t.node)), ['2', '3', '5']);
});
