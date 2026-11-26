// Logic tests for the Range. Run with: npm test  (node --test, no dependencies)
// The component is driven directly: no DOM, setState applied synchronously, gestures simulated in world units.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Range } from '../src/range/Range.js';
import { memoryStore, START_DONE as DONE0 } from '../src/levels.js';

const SC = 390 / 560; // screen px per world unit at zoom 1 when no board has been measured

function make() {
  const c = new Range({ legacy: true });
  c.setState = function (o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); };
  c.renderVals();
  return c;
}
const ev = (x, y) => ({ clientX: x * SC, clientY: y * SC, preventDefault() {}, stopPropagation() {} });
const show = n => n.t === 's' || n.t === 'v' ? n.el
  : n.t === 'prod' ? n.factors.map(show).join('·') + (n.vec ? '·' + show(n.vec) : '')
  : '(' + n.terms.map(t => show(t.node)).join(' + ') + ')';
const zone = c => c.state.tops.filter(t => c.zoneIds.includes(t.node.id)).map(t => show(t.node));
const result = c => { c.renderVals(); return [c.zoneValue]; };
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

// drag a tray piece so its centre lands on (tx, ty); returns what it was hovering just before release
function dragPiece(c, pid, tx, ty) {
  c.renderVals();
  const pc = c.state.pieces.find(p => p.id === pid);
  const dx = tx - (pc.x + (pid === 'PZS' ? 48 : c.K.ZW / 2)), dy = ty - (pc.y + 44);
  c.pieceDown(pc)(ev(0, 0));
  c.pmove(ev(dx / 2, dy / 2)); c.renderVals();
  c.pmove(ev(dx, dy)); c.renderVals();
  const hover = c.state.zeroHover;
  c.pend(); c.renderVals();
  return hover;
}
const centre = (c, id) => { c.renderVals(); const p = c.P.get(id); return [p.x + p.w / 2, p.y + p.h / 2]; };
const rightBracket = (c, id) => { c.renderVals(); const p = c.P.get(id); return [p.x + p.w - 17, p.y + p.h / 2]; };

test('zero: dropped on a vector on its own, it becomes (w + 0), with the 0 to the right', () => {
  const c = make();
  const w = byEl(c, '𝑤');
  const plusesBefore = c.renderVals().pluses.filter(p => p.op === 1).length;
  const u = byEl(c, '(1, 2, 3)'); const ux = c.state.tops.find(t => t.node.id === u.id).x;
  const hover = dragPiece(c, 'PZ', ...centre(c, w.id));
  assert.equal(hover.id, w.id);
  const top = c.state.tops.find(t => t.node.t === 'sum' && t.node.terms.some(u => u.node.id === w.id));
  assert.ok(top, 'w is now in a sum');
  assert.equal(show(top.node), '(𝑤 + 0)');
  const [a, b] = top.node.terms;
  assert.ok(b.x > a.x, 'the 0 sits right of w');
  assert.equal(b.node.type, '𝑊', 'it is the zero of w’s space');
  assert.equal(c.renderVals().pluses.filter(p => p.op === 1).length, plusesBefore + 1, 'one new plus');
  const sumRight = c.P.get(top.node.id).x + c.P.get(top.node.id).w;
  assert.ok(c.state.tops.find(t => t.node.id === u.id).x > ux && c.P.get(u.id).x >= sumRight, '𝑈 moved aside');
  assert.match(c.state.flash.text, /𝑤 = 𝑤 \+ 0/);
});

test('zero: on a docked vector it goes after the whole term (−1·v + 0), not inside it, and the value is unchanged', () => {
  const c = make();
  const T = c.state.tops[1].node; const v = T.vec;
  const hover = dragPiece(c, 'PZ', ...centre(c, v.id));
  assert.equal(hover.id, T.id, 'the target is the term −1·𝑣');
  assert.ok(hover.glow.includes(T.factors[0].id) && hover.glow.includes(v.id), 'the whole term glows');
  assert.ok(c.state.tops.some(t => show(t.node) === '−1·𝑣'), '−1·𝑣 is untouched');
  assert.equal(zone(c).filter(x => x === '0').length, 1, 'a 0 joined the expression as its own term');
  assert.deepEqual(result(c), ['= 4𝑣']);
  assert.match(c.state.flash.text, /−1·𝑣 = −1·𝑣 \+ 0/);
});

test('zero: inside a vector-sum bracket a docked term gets + 0 after it', () => {
  const c = make();
  const w = byEl(c, '𝑤');
  dragPiece(c, 'PZ', ...centre(c, w.id));         // (𝑤 + 0)
  const S = c.state.tops.find(t => t.node.t === 'sum' && t.node.terms.some(u => u.node.id === w.id)).node;
  const half = byEl(c, '½'); c.renderVals(); const pw = c.P.get(w.id);
  dragTo(c, half.id, pw.x - 96 + 54 + 48, pw.y + 44); // dock ½ onto 𝑤: (½·𝑤 + 0)
  const S1 = c.state.tops.find(t => t.node.id === S.id).node;
  assert.equal(show(S1), '(½·𝑤 + 0)');
  dragPiece(c, 'PZ', ...centre(c, w.id));
  assert.equal(show(c.state.tops.find(t => t.node.id === S.id).node), '(½·𝑤 + 0 + 0)');
});

test('zero: hovering a vector sum’s right bracket highlights the whole bracket; the 0 joins at the right end', () => {
  const c = make();
  const w = byEl(c, '𝑤');
  dragPiece(c, 'PZ', ...centre(c, w.id));
  const S = c.state.tops.find(t => t.node.t === 'sum' && t.node.terms.some(u => u.node.id === w.id)).node;
  // hover, without releasing
  c.renderVals();
  const pc = c.state.pieces.find(p => p.id === 'PZ');
  const [tx, ty] = rightBracket(c, S.id);
  c.pieceDown(pc)(ev(0, 0));
  c.pmove(ev(tx - (pc.x + c.K.ZW / 2), ty - (pc.y + 44)));
  assert.equal(c.state.zeroHover.id, S.id);
  const g = c.renderVals().groups.find(x => x.anim.includes('rgPulse'));
  assert.ok(g, 'the bracket pair glows');
  c.pend(); c.renderVals();
  const S2 = c.state.tops.find(t => t.node.id === S.id).node;
  assert.equal(show(S2), '(𝑤 + 0 + 0)');
  const xs = S2.terms.map(t => t.x);
  assert.ok(xs[2] > xs[1] && xs[1] > xs[0], 'the new 0 is the rightmost term');
});

test('zero: works in Rules mode; dropped on empty board it goes home; tapped it explains itself', () => {
  const c = make();
  c.setState({ rules: true });
  const before = JSON.stringify(c.state.tops.map(t => show(t.node)));
  dragPiece(c, 'PZ', 500, 300);
  assert.equal(JSON.stringify(c.state.tops.map(t => show(t.node))), before, 'nothing changed');
  const pz = c.state.pieces.find(p => p.id === 'PZ'); assert.equal(pz.x, pz.hx);
  const v = c.state.tops[1].node.vec;
  dragPiece(c, 'PZ', ...centre(c, v.id));
  assert.ok(c.state.tops.some(t => show(t.node) === '−1·𝑣'), 'the term is untouched');
  assert.equal(zone(c).filter(x => x === '0').length, 1, 'the 0 is its own term');
  c.pieceDown(c.state.pieces.find(p => p.id === 'PZ'))(ev(0, 0)); c.pend();
  assert.match(c.state.flash.text, /Drag the 0 onto a vector/);
});

test('scalar zero: in Rules mode it joins the bracket multiplying v: (2 + 3 + 0)v, still 4v', () => {
  const c = make();
  c.setState({ rules: true });
  const G = c.state.tops[0].node.factors[0];
  const hover = dragPiece(c, 'PZS', ...rightBracket(c, G.id));
  assert.equal(hover.id, G.id);
  assert.equal(show(c.state.tops[0].node), '(2 + 3 + 0)·𝑣');
  assert.equal(c.state.tops[0].node.factors[0].terms[2].node.field, 'R', 'a real zero, like the sum');
  assert.deepEqual(result(c), ['= 4𝑣']);
});

test('scalar zero: on a scalar inside the bracket it goes right after it; vectors ignore it, and the vector 0 ignores scalars', () => {
  const c = make();
  const two = c.state.tops[0].node.factors[0].terms[0].node;
  dragPiece(c, 'PZS', ...centre(c, two.id));
  assert.equal(show(c.state.tops[0].node), '(2 + 0 + 3)·𝑣');
  const w = byEl(c, '𝑤');
  assert.equal(dragPiece(c, 'PZS', ...centre(c, w.id)), null);
  const three = c.state.tops[0].node.factors[0].terms[2].node;
  assert.equal(dragPiece(c, 'PZ', ...centre(c, three.id)), null);
  assert.equal(show(c.state.tops[0].node), '(2 + 0 + 3)·𝑣', 'nothing else changed');
});

test('the 0 tile in ℝ adds like the tray zeros: over the (2 + 3) bracket it joins, in both modes', () => {
  for (const rules of [false, true]) {
    const c = make();
    c.setState({ rules });
    const zero = c.state.tops.find(t => t.node.el === '0').node;
    const G = c.state.tops[0].node.factors[0];
    c.renderVals(); const p = c.P.get(zero.id); const [tx, ty] = rightBracket(c, G.id);
    c.begin(zero.id, 'self', ev(0, 0));
    c.move(ev((tx - p.x - 48) / 2, (ty - p.y - 44) / 2)); c.renderVals();
    c.move(ev(tx - p.x - 48, ty - p.y - 44)); c.renderVals();
    assert.equal(c.state.zeroHover && c.state.zeroHover.id, G.id, 'the bracket is highlighted');
    c.end(); c.renderVals();
    assert.equal(show(c.state.tops[0].node), '(2 + 3 + 0)·𝑣', rules ? 'rules' : 'sandbox');
    assert.ok(!c.state.tops.some(t => t.node.id === zero.id), 'the tile itself moved in');
    assert.deepEqual(result(c), ['= 4𝑣']);
  }
});

test('the 0 tile in ℝ: centred on a scalar it adds; beside it, it still docks; a ℂ term refuses it', () => {
  const c = make();
  const zero = () => c.state.tops.find(t => t.node.el === '0' && t.node.t === 's').node;
  const two = c.state.tops[0].node.factors[0].terms[0].node;
  dragTo(c, zero().id, ...centre(c, two.id));
  assert.equal(show(c.state.tops[0].node), '(2 + 0 + 3)·𝑣');
  const c2 = make();
  const z2 = c2.state.tops.find(t => t.node.el === '0').node;
  const w = byEl(c2, '𝑤');
  c2.renderVals(); const pw = c2.P.get(w.id);
  dragTo(c2, z2.id, pw.x + 54 - 96 + 48, pw.y + 44);  // onto 𝑤's field edge: a scalar target isn't there, so it docks
  assert.ok(c2.state.tops.some(t => show(t.node) === '0·𝑤'), 'docked: 0·𝑤');
  const c3 = make();
  const z3 = c3.state.tops.find(t => t.node.el === '0').node;
  const i = c3.state.tops.find(t => t.node.el === '𝑖').node;
  c3.renderVals();
  c3.begin(z3.id, 'self', ev(0, 0)); const p3 = c3.P.get(z3.id), pi = c3.P.get(i.id);
  c3.move(ev(pi.x - p3.x, pi.y - p3.y));
  assert.equal(c3.state.zeroHover, null, 'a real 0 is not offered to a complex scalar');
  c3.end();
});

// the board as it ships: Rules mode, only the two zeros in the tray
function makeLive(props = { demo: true }) {
  const c = new Range(props);
  c.setState = function (o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); };
  c.renderVals();
  return c;
}
const readout = c => c.renderVals().results.map(r => r.main);

test('live board: Rules mode, the tray holds just 0 in ℝ and 0 in 𝑉, and the readout is the expression', () => {
  const c = makeLive();
  assert.equal(c.state.rules, true);
  assert.deepEqual(c.state.pieces.map(p => p.id), ['PZS', 'PZ', 'PO']);
  const v = c.renderVals();
  assert.equal(v.vecs.length + v.hexes.length, 2 + 3, 'two vectors and three scalars: the tray is a popup, not on the board');
  assert.equal(v.tray.open, false, 'the tray starts closed');
  assert.equal(v.parenSrc, null);
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −1𝑣']);
});

test('live board: the readout follows the tree as moves change it', () => {
  const c = makeLive();
  const G = c.state.tops[0].node.factors[0];
  dragPiece(c, 'PZS', ...rightBracket(c, G.id));
  assert.deepEqual(readout(c), ['(2 + 3 + 0)𝑣 + −1𝑣']);
  const v = c.state.tops.find(t => t.node.factors && t.node.factors[0].el === '−1').node.vec;
  dragPiece(c, 'PZ', ...centre(c, v.id));
  assert.deepEqual(readout(c), ['(2 + 3 + 0)𝑣 + −1𝑣 + 0']);
  // the gold zero is in ℝ: it isn't offered to vectors
  assert.equal(dragPiece(c, 'PZS', ...centre(c, v.id)), null);
});

test('negative tiles are night tiles: −1 has a dark face and keeps its minus; −𝑣 has a dark body, a day edge, and −𝑣 written', () => {
  const c = makeLive();
  const v = c.renderVals();
  const neg1 = v.hexes.find(h => h.el === '−1'), two = v.hexes.find(h => h.el === '2');
  assert.equal(neg1.face, '#3B2C12'); assert.equal(two.face, '#FFF8E6');
  // a −𝑣 (no move makes one yet: set it up by hand)
  const T = c.state.tops[1].node; c.state.tops[1].node = Object.assign(c.mkV('𝑉', '𝑣', 'v', 'R', 140), { neg: true });
  const v2 = c.renderVals();
  const nv = v2.vecs.find(t => t.el === '−𝑣');
  assert.ok(nv, '−𝑣 is written on the tile');
  assert.equal(nv.face, '#182654');
  assert.ok(v2.vecs.find(t => t.el === '𝑣').face === '#F5F8FF', 'positive vectors stay day');
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −𝑣']);
  assert.equal(c.zoneValue, '= 4𝑣', 'and it evaluates as −𝑣');
  assert.notEqual(c.sig(c.state.tops[1].node), c.sig(T.vec), '−𝑣 and 𝑣 are different tiles');
});

test('a 0 added after a wide term stays in its row, past the edge if need be (the board scrolls)', () => {
  const c = makeLive();
  const T0 = c.state.tops[0].node;
  dragPiece(c, 'PZ', ...centre(c, T0.vec.id));            // (2 + 3)𝑣 + 0 + −1𝑣
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + 0 + −1𝑣']);
  c.renderVals();
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  const tp = c.P.get(T0.id), zp = c.P.get(z.id);
  assert.ok(Math.abs((zp.y + zp.h / 2) - (tp.y + tp.h / 2)) < 2, 'same row as (2 + 3)𝑣');
  assert.ok(zp.x > tp.x + tp.w, 'right after it');
  assert.ok(c.zoneIds.includes(z.id), 'still in the expression');
});

test('readout during a drag: the whole expression stays, the moving part glows; after the move it updates', () => {
  const c = makeLive();
  const va = c.state.tops[1].node.vec, vb = c.state.tops[0].node.vec;
  c.renderVals(); const p = c.P.get(va.id), q = c.P.get(vb.id);
  c.begin(va.id, 'self', ev(0, 0));
  c.move(ev((q.x - p.x) / 2, (q.y - p.y) / 2)); c.renderVals();
  c.move(ev(q.x - p.x, q.y - p.y));
  const r = c.renderVals().results[0];
  assert.equal(r.main, '(2 + 3)𝑣 + −1𝑣', 'nothing dropped out of the readout');
  assert.deepEqual(r.segs.filter(x => x.hot).map(x => x.t.trim()).join('|'), '𝑣|−1𝑣', 'the dragged −1𝑣 and the 𝑣 it would join glow');
  c.end();
  assert.deepEqual(readout(c), ['(2 + 3 + −1)𝑣']);
  assert.ok(c.renderVals().results[0].segs.every(x => !x.hot), 'nothing glows once it is done');
});

test('factoring leaves out terms without the factor: (2 + 3)𝑣 + −1𝑣 + 0 → (2 + 3 + −1)𝑣 + 0', () => {
  const c = makeLive();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[1].node.vec.id));
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −1𝑣 + 0']);
  const va = c.state.tops[1].node.vec, vb = c.state.tops[0].node.vec;
  dragTo(c, va.id, ...centre(c, vb.id));
  assert.deepEqual(readout(c), ['(2 + 3 + −1)𝑣 + 0']);
  assert.equal(c.zoneValue, '= 4𝑣');
});

test('factoring a scalar: 2·0 has the 2 and groups in, a bare 0 stays out', () => {
  const c = makeLive();
  const V = () => c.mkV('𝑉', '𝑣', 'v', 'R', 140), Z = () => c.mkV('𝑉', '0', 'zero', 'R', 110), two = () => c.mkS('R', '2', '2');
  c.setState({ tops: [
    { node: c.mkProd([two()], V()), x: 24, y: c.K.ZT + 110 },
    { node: c.mkProd([two()], Z()), x: 250, y: c.K.ZT + 110 },
    { node: Z(), x: 24, y: c.K.ZT + 250 },
  ] });
  c.renderVals();
  const a = c.state.tops[0].node.factors[0], b = c.state.tops[1].node.factors[0];
  dragTo(c, a.id, ...centre(c, b.id));
  assert.deepEqual(readout(c), ['2(𝑣 + 0) + 0']);
});

test('inside a bracket too: (2𝑣 + 3𝑣 + 0) groups the 𝑣 terms and keeps the 0 in the bracket', () => {
  const c = makeLive();
  const V = () => c.mkV('𝑉', '𝑣', 'v', 'R', 140), Z = () => c.mkV('𝑉', '0', 'zero', 'R', 110);
  const S = c.mkSum([{ node: c.mkProd([c.mkS('R', '2', '2')], V()), x: 0, y: 0 }, { node: c.mkProd([c.mkS('R', '3', '3')], V()), x: 0, y: 0 }, { node: Z(), x: 0, y: 0 }]);
  c.rowArrange(S);
  c.setState({ tops: [{ node: c.mkProd([c.mkS('R', '½', '½')], S), x: 10, y: 600 }] });
  c.renderVals();
  dragTo(c, S.terms[1].node.vec.id, ...centre(c, S.terms[0].node.vec.id));
  const top = c.state.tops[0].node;
  assert.equal(show(top), '½·((2 + 3)·𝑣 + 0)');
});

test('a 0 in play, dropped on a term of its own sum, is absorbed: −1𝑣 + 0 → −1𝑣', () => {
  const c = makeLive();
  const T1 = c.state.tops[1].node;
  dragPiece(c, 'PZ', ...centre(c, T1.vec.id));             // (2 + 3)𝑣 + −1𝑣 + 0
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  c.renderVals(); const p = c.P.get(z.id); const [tx, ty] = centre(c, T1.vec.id);
  c.begin(z.id, 'self', ev(0, 0));
  c.move(ev((tx - p.x - p.w / 2) / 2, (ty - p.y - p.h / 2) / 2)); c.renderVals();
  c.move(ev(tx - p.x - p.w / 2, ty - p.y - p.h / 2));
  assert.equal(c.state.zeroHover.id, T1.id, 'the whole term −1𝑣 glows');
  c.end(); c.renderVals();
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −1𝑣']);
  assert.match(c.state.flash.text, /−1·𝑣 \+ 0 = −1·𝑣/);
});

test('a 0 in a bracket is absorbed by a term of that bracket, and only that bracket', () => {
  const c = makeLive();
  const G = c.state.tops[0].node.factors[0];
  dragPiece(c, 'PZS', ...rightBracket(c, G.id));            // (2 + 3 + 0)𝑣
  const zs = c.state.tops[0].node.factors[0].terms[2].node;
  // over −1 (another sum): nothing to absorb into
  c.renderVals(); const p = c.P.get(zs.id); const m1 = c.state.tops[1].node.factors[0]; const q = c.P.get(m1.id);
  c.begin(zs.id, 'self', ev(0, 0)); c.move(ev((q.x - p.x) / 2, (q.y - p.y) / 2)); c.renderVals(); c.move(ev(q.x - p.x, q.y - p.y));
  assert.equal(c.state.zeroHover, null);
  c.end(); c.renderVals();
  const three = c.state.tops[0].node.factors[0].terms.find(t => t.node.el === '3').node;
  const z2 = c.state.tops[0].node.factors[0].terms.find(t => t.node.el === '0').node;
  dragTo(c, z2.id, ...centre(c, three.id));
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −1𝑣']);
});

test('absorbing the 0 out of a two-term bracket drops the bracket: ½·(𝑣 + 0) → ½·𝑣', () => {
  const c = makeLive();
  const v = c.mkV('𝑉', '𝑣', 'v', 'R', 140), z = c.mkV('𝑉', '0', 'zero', 'R', 110);
  const S = c.mkSum([{ node: v, x: 0, y: 0 }, { node: z, x: 0, y: 0 }]); c.rowArrange(S);
  c.setState({ tops: [{ node: c.mkProd([c.mkS('R', '½', '½')], S), x: 24, y: c.K.ZT + 110 }] });
  dragTo(c, z.id, ...centre(c, v.id));
  assert.deepEqual(readout(c), ['½𝑣']);
});

test('tray popup: opens with two tabs; a 0 dragged out of it lands on the board, and the popup hides during the drag', () => {
  const c = makeLive();
  let v = c.renderVals();
  v.tray.toggle(); v = c.renderVals();
  assert.equal(v.tray.show, true); assert.equal(v.tray.tab, 'tray');
  v.tray.pick('lean')(); assert.equal(c.renderVals().tray.tab, 'lean');
  v.tray.pick('tray')(); v = c.renderVals();
  // drag the blue 0 from the popup onto −1𝑣's 𝑣
  const tile = v.tray.tiles.vec; const T1 = c.state.tops[1].node; const [tx, ty] = centre(c, T1.vec.id);
  tile.down(ev(0, 0));
  const pz = c.state.pieces.find(p => p.id === 'PZ');
  const dx = tx - (pz.x + c.K.ZW / 2), dy = ty - (pz.y + 44);
  c.pmove(ev(dx / 2, dy / 2)); v = c.renderVals();
  assert.equal(v.tray.show, false, 'hidden while dragging');
  assert.ok(v.vecs.some(t => t.el === '0'), 'the dragged 0 is drawn on the board');
  c.pmove(ev(dx, dy)); c.renderVals();
  c.pend(); v = c.renderVals();
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −1𝑣 + 0']);
  assert.equal(v.tray.show, true, 'back after the drop');
  v.tray.toggle();
  assert.equal(c.renderVals().tray.closing, true, 'slides down first');
});

test('the expression box hugs its tiles and always holds the heading and readout', () => {
  const c = makeLive();
  let v = c.renderVals();
  const head = { l: 28, t: c.K.ZT };
  const inBox = (b, x, y) => x >= b.zoneL && x <= b.zoneL + b.zoneW && y >= b.zoneT && y <= b.zoneT + b.zoneH;
  assert.ok(inBox(v, head.l, head.t + 10), 'heading inside');
  assert.equal(v.results[0].y, c.K.ZT + 34, 'readout right under the heading');
  const r0 = v.zoneL + v.zoneW;
  // drag (2 + 3)𝑣 far right (staying in the expression's band): the box grows right
  const T0 = c.state.tops[0].node; c.renderVals(); const p = c.P.get(T0.id);
  c.begin(T0.vec.id, 'self', ev(0, 0)); c.move(ev(150, 0)); c.renderVals(); c.move(ev(300, 0)); c.end();
  v = c.renderVals();
  assert.ok(v.zoneL + v.zoneW > r0 + 250, 'grew to the right');
  // and far left: grows left, still holding the heading
  c.begin(T0.vec.id, 'self', ev(0, 0)); c.move(ev(-300, 0)); c.renderVals(); c.move(ev(-700, 0)); c.end();
  v = c.renderVals();
  assert.ok(v.zoneL < -300, 'grew to the left');
  assert.ok(inBox(v, head.l, head.t + 10) && inBox(v, 28 + 200, c.K.ZT + 60), 'heading and readout still inside');
  assert.ok(v.zoneL + v.zoneW < r0 + 250, 'and shrank back on the right');
});

// drag something out of the tray's tree: a leaf (by its text), an operator ('·', '+'), or a − / ⁻¹ node ('neg', 'inv')
function treeItem(c, which) {
  const T = c.renderVals().tray.tree;
  return T.wraps.find(w => w.kind === which) || T.nodes.find(m => (m.kind === 'op' && m.sym === which) || (m.kind === 'leaf' && c.elText(m.node) === which));
}
function dragTree(c, which, tx, ty) {
  const it = treeItem(c, which); it.down(ev(0, 0));           // the finger starts at (0, 0) and ends on the target
  c.imove(ev(tx / 2, ty / 2)); c.renderVals(); c.imove(ev(tx, ty)); c.renderVals();
  const hover = c.state.zeroHover; c.iend(); c.renderVals(); return hover;
}
const tapTree = (c, which) => { treeItem(c, which).down(ev(0, 0)); c.iend(); c.renderVals(); };

// level 1, as it ships
// (with 1.27 won, so the tree offers −(…) for vectors; fresh progress gets the inverse axiom's ∃𝑤 instead)
const makeLevel = () => makeLive({ store: memoryStore({ v: 2, done: DONE0.concat(['1.27']) }) });
const makeFresh = () => makeLive({ store: memoryStore() });
const tap = (c, id) => { c.renderVals(); c.begin(id, 'self', ev(0, 0)); c.end(); c.renderVals(); };
function dragItem(c, n, tx, ty) {
  const v = c.renderVals(); const t = v.tray.list.filter(x => x.t.el === n)[0].t;
  t.down(ev(0, 0));
  c.imove(ev(tx / 2, ty / 2)); c.renderVals(); c.imove(ev(tx, ty)); c.renderVals();
  const hover = c.state.zeroHover; c.iend(); c.renderVals(); return hover;
}

test('level 1: goal 0 in 𝑉, start 0·𝑣, with ASSUMPTIONS and GOAL above the expression', () => {
  const c = makeLevel();
  const v = c.renderVals();
  assert.deepEqual(readout(c), ['0𝑣']);
  assert.deepEqual(v.heads.map(h => h.title), ['ASSUMPTIONS', 'GOAL · 1.30']);
  assert.equal(v.heads[0].tokens.map(k => k.t).join(''), '{𝑉 : Type}   [VectorSpace ℝ 𝑉]   (𝑣 : 𝑉)');
  assert.deepEqual(v.heads[0].tokens.filter(k => k.tile).map(k => k.t + ':' + k.tile.kind), ['𝑉:para', 'ℝ:para', '𝑉:para', '(𝑣 : 𝑉):decl']);
  assert.equal(v.heads[1].tokens.map(k => k.t).join(''), '0');
  assert.ok(v.heads.every(h => h.on), 'tiles shown at first');
  assert.ok(v.heads[1].y + 82 < c.K.ZT && v.heads[0].y + 82 < v.heads[1].y, 'stacked above the expression without overlapping');
  assert.equal(v.won, false);
});

test('tapping a header switches its tiles off and on (the token widths animate between text and tile)', () => {
  const c = makeLevel();
  let h = c.renderVals().heads[0];
  const vTok = () => c.renderVals().heads[0].tokens.find(k => k.t === '(𝑣 : 𝑉)');
  const part = s => vTok().parts.find(p => p.s === s);
  assert.equal(vTok().width, vTok().W, 'tile mode: as wide as the 𝑣 tile');
  assert.ok(part('𝑉').tf.includes('translateY(-21.5px)') && part('𝑉').tf.includes('scale'), '𝑉 rises into the band and shrinks');
  assert.equal(part(' : ').op, 0, 'the colon fades');
  assert.equal(part('𝑣').color, '#16130C');
  const xTile = part('𝑣').x;
  h.toggle();
  assert.equal(c.renderVals().heads[0].on, false);
  assert.equal(vTok().width, vTok().w, 'back to the text width');
  assert.equal(part('𝑉').tf, 'none'); assert.equal(part(' : ').op, 1);
  assert.notEqual(part('𝑣').x, xTile, '𝑣 slides sideways (and only sideways)');
  c.renderVals().heads[0].toggle();
  assert.equal(vTok().width, vTok().W);
});

test('tapping a tile shows its group as a tree in the tray: operators as nodes, tiles as leaves', () => {
  const c = makeLevel();
  tap(c, c.state.tops[0].node.vec.id);
  const v = c.renderVals();
  assert.equal(v.tray.show, true);
  const T = v.tray.tree;
  assert.deepEqual(T.nodes.map(m => m.kind === 'op' ? m.sym : c.elText(m.node)), ['·', '0', '𝑣']);
  assert.equal(T.edges.length, 2);
  // leaves sit below their operator
  assert.ok(T.nodes[1].y > T.nodes[0].y && T.nodes[2].y > T.nodes[0].y);
});

test('tree: tapping a leaf makes it a night tile (in the tree only); tapping a vector operator toggles −(…) with a pop', () => {
  const c = makeLevel();
  tap(c, c.state.tops[0].node.vec.id);
  tapTree(c, '𝑣');
  assert.ok(treeItem(c, '−𝑣'), 'the leaf is now −𝑣');
  assert.deepEqual(readout(c), ['0𝑣'], 'the board is unchanged');
  tapTree(c, '−𝑣');                                   // → plain again (after 1.27, − replaces the existence form)
  assert.ok(treeItem(c, '𝑣') && c.renderVals().tray.tree.wraps.length === 0);
  tapTree(c, '·');
  let T = c.renderVals().tray.tree;
  assert.deepEqual(T.wraps.map(w => w.kind), ['neg']);
  assert.ok(T.boxes[0].neg, 'a night box around the subtree');
  tapTree(c, '·');
  T = c.renderVals().tray.tree;
  assert.equal(T.wraps.length, 0, 'a toggle: − and back, no existence form once 1.27 is won');
  assert.deepEqual(T.leaving.map(l => l.wrap ? 'wrap' : 'box').sort(), ['box', 'wrap'], 'they pop out');
});

test('tree: a scalar operator cycles −, −…⁻¹, ⁻¹, plain; the − slides up when the ⁻¹ arrives', () => {
  const c = makeLevel();
  const G = c.mkSum([{ node: S0(c, '2', '2'), x: 0, y: 0 }, { node: S0(c, '3', '3'), x: 0, y: 0 }]); c.rowArrange(G);
  c.setState({ tops: [{ node: c.mkProd([G], V0(c)), x: 24, y: c.K.ZT + 110 }] });
  c.renderVals();
  tap(c, G.terms[0].node.id);
  tapTree(c, '+');
  let T = c.renderVals().tray.tree; const negY = T.wraps.find(w => w.kind === 'neg').y;
  assert.deepEqual(T.wraps.map(w => w.kind), ['neg']);
  tapTree(c, '+');
  T = c.renderVals().tray.tree;
  assert.deepEqual(T.wraps.map(w => w.kind).sort(), ['inv', 'neg']);
  assert.ok(T.wraps.find(w => w.kind === 'neg').y < negY, '− moved up');
  assert.ok(T.wraps.find(w => w.kind === 'inv').y > T.wraps.find(w => w.kind === 'neg').y, '⁻¹ below it');
  tapTree(c, '+');
  T = c.renderVals().tray.tree;
  assert.deepEqual(T.wraps.map(w => w.kind), ['inv']);
  assert.ok(Math.abs(T.wraps[0].y - negY) < 1, '⁻¹ slid to the middle');
  assert.ok(T.boxes[0].inv && !T.boxes[0].neg, 'an outline, not night');
  tapTree(c, '+');
  assert.equal(c.renderVals().tray.tree.wraps.length, 0);
});

test('tree: drag a negated group out onto a 0: it lands as −(0𝑣), its inverse beside it', () => {
  const c = makeLevel();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id));  // 0𝑣 + 0
  tap(c, c.state.tops[0].node.vec.id);
  tapTree(c, '·');                                                // −(0𝑣) in the tree
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  const hover = dragTree(c, 'neg', ...centre(c, z.id));
  assert.equal(hover.id, z.id);
  assert.deepEqual(readout(c), ['0𝑣 − (0𝑣) + 0𝑣']);
});

test('a tray tile dropped on a 0 of its type splits it: 0·𝑣 with 2 → (2 + −2)𝑣, sliding out from the drop', () => {
  const c = makeLevel();
  c.state.trayItems = [{ id: 'T1', node: c.mkS('R', '2', '2') }, { id: 'T2', node: c.mkS('R', '−2', '-2') }];
  const z = c.state.tops[0].node.factors[0];
  // a vector won't split a scalar 0
  c.state.trayItems.push({ id: 'T3', node: c.mkV('𝑉', '𝑣', 'v', 'R', 140) });
  assert.equal(dragItem(c, '𝑣', ...centre(c, z.id)), null);
  const hover = dragItem(c, '2', ...centre(c, z.id));
  assert.equal(hover.id, z.id, 'the 0 glowed');
  assert.deepEqual(readout(c), ['(2 + −2)𝑣']);
  const S = c.state.tops[0].node.factors[0];
  const [a, b] = S.terms.map(t => t.node);
  assert.ok(c.state.slides[a.id].top && c.state.slides[b.id] && !c.state.slides[b.id].top, 'both slide out, the inverse underneath');
  assert.equal(b.el, '−2'); assert.equal(c.renderVals().hexes.find(h => h.el === '−2').face, '#3B2C12', 'a night tile');
});

test('splitting a vector 0 in the expression: … + 0 → … + 𝑣 + −𝑣', () => {
  const c = makeLevel();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); // 0𝑣 + 0
  tap(c, c.state.tops[0].node.vec.id);
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, '𝑣', ...centre(c, z.id));
  assert.deepEqual(readout(c), ['0𝑣 + 𝑣 + −𝑣']);
});

test('reaching the goal plays the win: the expression is exactly 0 in 𝑉', () => {
  const c = makeLevel();
  c.setState({ tops: [{ node: c.mkV('𝑉', '0', 'zero', 'R', 110), x: 24, y: c.K.ZT + 110 }] });
  const v = c.renderVals();
  assert.equal(v.won, true);
  assert.ok(v.vecs.find(t => t.el === '0').anim.startsWith('winHop'), 'the tile hops');
  assert.equal(v.sparks.length, 8);
  assert.equal(v.results[0].note, 'goal reached');
  // a scalar 0 is not the goal
  c.setState({ tops: [{ node: c.mkS('R', '0', '0'), x: 24, y: c.K.ZT + 110 }] });
  assert.equal(c.renderVals().won, false);
});

test('the live proof: the board is sent as Lean trees, one finished move at a time, with the law it used', () => {
  const calls = [];
  const lean = { setLevel: (s, g) => calls.push(['level', s, g]), boardChanged: (f, t, h) => calls.push(['move', f, t, h]), subscribe: () => () => {} };
  const c = makeLive({ lean, store: memoryStore({ v: 2, done: DONE0.concat(['1.27']) }) });
  c.initLean();
  assert.deepEqual(calls[0], ['level', { smul: [{ n: 0 }, { v: 'v' }] }, { zero: true }]);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id));   // 0𝑣 + 0
  c.noteBoard();
  assert.deepEqual(calls[1], ['move', { smul: [{ n: 0 }, { v: 'v' }] }, { add: [{ smul: [{ n: 0 }, { v: 'v' }] }, { zero: true }] }, ['add_zero']]);
  c.noteBoard();
  assert.equal(calls.length, 2, 'nothing new, nothing sent');
  tap(c, c.state.tops[0].node.vec.id);
  tapTree(c, '𝑣');
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, '−𝑣', ...centre(c, z.id));
  c.noteBoard();
  // a split goes to Lean in two steps: the law makes the bracketed pair, then the bracket opens
  assert.deepEqual(calls[2][2], { add: [{ smul: [{ n: 0 }, { v: 'v' }] }, { add: [{ neg: { v: 'v' } }, { v: 'v' }] }] });
  assert.deepEqual(calls[2][3], ['add_neg_cancel']);
  assert.deepEqual(calls[3][2], { add: [{ smul: [{ n: 0 }, { v: 'v' }] }, { neg: { v: 'v' } }, { v: 'v' }] });
  assert.equal(calls[3][3], null);
});

test('the Lean tab shows the live proof: steps, goal, and No goals at the end', () => {
  const c = makeLevel();
  c.setState({ trayOpen: true, trayTab: 'lean', leanStatus: { state: 'ready' },
    leanLive: { state: 'live', theorem: 'theorem level1 … := by', steps: [{ ok: true, hint: ['add_zero'] }, { ok: false, hint: null, error: 'Lean refused the step' }], goals: ['v : V\n⊢ 0 • v + 0 = 0'], done: false } });
  let L = c.renderVals().tray.lean;
  assert.equal(L.status, 'Lean is running this proof live');
  assert.equal(L.live.goals[0], 'v : V\n⊢ 0 • v + 0 = 0');
  c.setState({ leanLive: Object.assign({}, c.state.leanLive, { goals: [], done: true, verified: true }) });
  L = c.renderVals().tray.lean;
  assert.equal(L.live.done, true);
  c.setState({ leanStatus: { state: 'asleep' } });
  assert.match(c.renderVals().tray.lean.status, /Press Play/);
});

// clusters with neg / inv, built directly (the tree view makes them in the game)
const V0 = c => c.mkV('𝑉', '𝑣', 'v', 'R', 140);
const S0 = (c, el, val) => c.mkS('R', el, val);
const negOf0v = c => Object.assign(c.mkProd([S0(c, '0', '0')], V0(c)), { neg: true });

test('a negative cluster: night box, − instead of + on its left, a leading − when first, and −(…) in the readout', () => {
  const c = makeLevel();
  const Y = c.K.ZT + 110;
  c.setState({ tops: [{ node: c.mkProd([S0(c, '0', '0')], V0(c)), x: 24, y: Y }, { node: negOf0v(c), x: 300, y: Y }] });
  let v = c.renderVals();
  assert.deepEqual(readout(c), ['0𝑣 − (0𝑣)']);
  assert.equal(v.boxes.length, 1); assert.equal(v.boxes[0].neg, true);
  assert.ok(v.pluses.some(p => p.op === 1 && p.sym === '−'), 'the sign between them is −');
  c.setState({ tops: [{ node: negOf0v(c), x: 60, y: Y }] });
  v = c.renderVals();
  assert.deepEqual(readout(c), ['−(0𝑣)']);
  assert.ok(v.pluses.some(p => p.sym === '−' && p.pe === 'none'), 'a leading −');
  assert.deepEqual(c.leanTree(c.state.tops[0].node), { neg: { smul: [{ n: 0 }, { v: 'v' }] } });
  assert.equal(c.zoneValue, '= 0');
});

test('additive inverses cancel to 0: drag −(0𝑣) onto a tile of the matching 0𝑣', () => {
  const c = makeLevel();
  const Y = c.K.ZT + 110;
  const T = c.mkProd([S0(c, '0', '0')], V0(c)); const N = negOf0v(c);
  c.setState({ tops: [{ node: T, x: 24, y: Y }, { node: N, x: 300, y: Y }] });
  c.renderVals();
  const p = c.P.get(N.id); const [tx, ty] = centre(c, T.vec.id);
  c.begin(N.vec.id, 'self', ev(0, 0));                      // grabbing its 𝑣 moves the whole cluster
  c.move(ev((tx - p.x - p.w / 2) / 2, (ty - p.y - p.h / 2) / 2)); c.renderVals();
  c.move(ev(tx - p.x - p.w / 2, ty - p.y - p.h / 2));
  assert.equal(c.state.zeroHover && c.state.zeroHover.id, T.id, 'the twin glows');
  assert.ok(c.state.zeroHover.glow.includes(T.factors[0].id));
  c.end();
  assert.deepEqual(readout(c), ['0']);
  assert.equal(c.state.tops[0].node.key, 'zero', 'a 0 in 𝑉');
  assert.equal(c.renderVals().won, true, 'and that is the goal');
});

test('a mismatched cluster does not cancel (no reordering is assumed)', () => {
  const c = makeLevel();
  const Y = c.K.ZT + 110;
  const T = c.mkProd([S0(c, '2', '2')], V0(c)); const N = Object.assign(c.mkProd([S0(c, '3', '3')], V0(c)), { neg: true });
  c.setState({ tops: [{ node: T, x: 24, y: Y }, { node: N, x: 300, y: Y }] });
  c.renderVals(); const p = c.P.get(N.id); const [tx, ty] = centre(c, T.vec.id);
  c.begin(N.vec.id, 'self', ev(0, 0)); c.move(ev(tx - p.x - p.w / 2, ty - p.y - p.h / 2));
  assert.equal(c.state.zeroHover, null);
  c.end();
});

test('multiplicative inverses cancel to 1 in a product: (2·3)⁻¹ onto the 2 of 2·3', () => {
  const c = makeLevel();
  const inv = Object.assign(c.mkProd([S0(c, '2', '2'), S0(c, '3', '3')], null), { inv: true });
  const P = c.mkProd([S0(c, '2', '2'), S0(c, '3', '3'), inv], V0(c));
  c.setState({ tops: [{ node: P, x: 24, y: c.K.ZT + 110 }] });
  let v = c.renderVals();
  assert.deepEqual(readout(c), ['2·3·(2·3)⁻¹𝑣']);
  assert.ok(v.boxes.some(b => b.inv), 'an outlined box with ⁻¹');
  const two = P.factors[0];
  dragTo(c, inv.id, ...centre(c, two.id), 'bit');
  assert.deepEqual(readout(c), ['1𝑣']);
});

test('a 1 in a product is absorbed by another tile of it; the tray 1 makes x·1 or 1·𝑣, taking the field', () => {
  const c = makeLevel();
  const T = c.state.tops[0].node;                          // 0·𝑣
  dragPiece(c, 'PO', ...centre(c, T.vec.id));
  assert.deepEqual(readout(c), ['0·1𝑣']);
  const one = c.state.tops[0].node.factors[1];
  assert.equal(one.field, 'R');
  dragPiece(c, 'PO', ...centre(c, c.state.tops[0].node.factors[0].id));
  assert.deepEqual(readout(c), ['0·1·1𝑣']);
  dragTo(c, one.id, ...centre(c, c.state.tops[0].node.factors[0].id));
  assert.deepEqual(readout(c), ['0·1𝑣']);
});

test('tray pieces are untyped (recessed bands) until they land', () => {
  const c = makeLevel();
  c.setState({ trayOpen: true });
  const v = c.renderVals();
  assert.equal(v.tray.tiles.hex.type, '𝐅'); assert.equal(v.tray.tiles.hex.band, '#C38F2A');
  assert.equal(v.tray.tiles.vec.vband, '#1F3F9A');
  assert.equal(v.tray.tiles.one.el, '1'); assert.equal(v.tray.tiles.one.type, '𝐅');
});

test('1 splits into x·x⁻¹ from the tree; refused for 0', () => {
  const c = makeLevel();
  dragPiece(c, 'PO', ...centre(c, c.state.tops[0].node.vec.id));   // 0·1·𝑣
  const one = c.state.tops[0].node.factors[1];
  c.state.trayItems = [{ id: 'T1', node: S0(c, '2', '2') }, { id: 'T2', node: S0(c, '0', '0') }];
  dragItem(c, '2', ...centre(c, one.id));
  assert.deepEqual(readout(c), ['0·2·(2)⁻¹𝑣']);
});

test('level 1 can be won: 0𝑣 = 0𝑣 + 0 = 0𝑣 + 0𝑣 + −(0𝑣) = (0 + 0)𝑣 + −(0𝑣) = 0𝑣 + −(0𝑣) = 0', () => {
  const c = makeLevel();
  const T = c.state.tops[0].node;
  dragPiece(c, 'PZ', ...centre(c, T.vec.id));                         // 0𝑣 + 0
  assert.deepEqual(readout(c), ['0𝑣 + 0']);
  tap(c, T.vec.id);                                                   // the tree of 0𝑣
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, '·', ...centre(c, z.id));                               // 0 = 0𝑣 + −(0𝑣)
  assert.deepEqual(readout(c), ['0𝑣 + 0𝑣 − (0𝑣)']);
  const prods = () => c.state.tops.filter(t => t.node.t === 'prod' && !c.flagged(t.node)).map(t => t.node);
  const [a, b] = prods();
  dragTo(c, b.vec.id, ...centre(c, a.vec.id));                        // factor 𝑣 out of the two plain terms only
  assert.deepEqual(readout(c), ['(0 + 0)𝑣 − (0𝑣)']);
  const G = c.state.tops.find(t => t.node.t === 'prod' && !c.flagged(t.node)).node.factors[0];
  dragTo(c, G.terms[1].node.id, ...centre(c, G.terms[0].node.id));    // 0 + 0 → 0
  assert.deepEqual(readout(c), ['0𝑣 − (0𝑣)']);
  const plain = c.state.tops.find(t => t.node.t === 'prod' && !c.flagged(t.node)).node;
  const neg = c.state.tops.find(t => c.flagged(t.node)).node;
  dragTo(c, neg.vec.id, ...centre(c, plain.vec.id));                  // x + −x = 0
  assert.deepEqual(readout(c), ['0']);
  assert.equal(c.renderVals().won, true);
});

test('the TOOLS tab fills the screen with the concept graph; its current node takes you back to the game', async () => {
  const { nodeState } = await import('../src/graph/ConceptGraph.js');
  const { START_DONE } = await import('../src/levels.js');
  const { NODES } = await import('../src/graph/data.js');
  const c = makeLevel();
  c.setState({ trayOpen: true });
  c.renderVals().tray.pick('tools')();
  let v = c.renderVals();
  assert.equal(v.tray.tools, true);
  assert.equal(v.tray.top, 0);
  assert.equal(Math.round(v.tray.h), Math.round(716 / (390 / 560)), 'the whole screen');
  assert.equal(nodeState('1.27', new Set(START_DONE), '1.30'), 'next', 'fresh progress: 1.27 is a level one step away');
  const done = new Set(START_DONE.concat(['1.27']));
  assert.equal(nodeState('1.27', done, '1.30'), 'done'); assert.equal(nodeState('1.30', done, '1.30'), 'active');
  assert.equal(nodeState('1.33', done, '1.30'), 'done', 'a definition: done once its prerequisites are');
  assert.equal(nodeState('1.32', done, '1.30'), 'partial', 'needs 1.30 too: shown with a dotted line, not playable');
  done.add('1.30');
  assert.equal(nodeState('1.32', done, '1.30'), 'next', 'once 1.30 is done, 1.32 is one step away');
  assert.equal(NODES.length, 22, 'chapter 1, with 1.26 and 1.31');
  assert.ok(NODES.find(n => n.id === '1.30').f.length > 0, 'it has the book text');
  v.tray.play();
  assert.equal(c.renderVals().tray.closing, true, 'the panel slides away');
});

const levelsMod = await import('../src/levels.js');
const freshStore = extra => levelsMod.memoryStore(extra || null);
const makeAt = (props) => makeLive(Object.assign({ store: freshStore() }, props));
const after = c => { c.renderVals(); c.noteBoard(); c.renderVals(); };

test('the proof stays hidden until a node is done', async () => {
  const { withoutProof } = await import('../src/graph/ConceptGraph.js');
  const { NODES } = await import('../src/graph/data.js');
  const n = NODES.find(x => x.id === '1.30');
  assert.ok(n.f.some(b => b[0] === 'pr'));
  assert.ok(!withoutProof(n.f).some(b => b[0] === 'pr'));
  assert.ok(withoutProof(n.f).length >= 1, 'the statement stays');
});

test('undo, redo and rewind walk the level\'s history; a new move overwrites what was ahead', () => {
  const c = makeAt({});
  after(c);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);            // 0𝑣 + 0 (no negation needed)
  dragPiece(c, 'PZS', ...centre(c, c.state.tops[0].node.factors[0].id)); after(c);    // (0 + 0)𝑣 + 0
  assert.deepEqual(readout(c), ['(0 + 0)𝑣 + 0']);
  let v = c.renderVals(); assert.equal(v.hist.canUndo, true); assert.equal(v.hist.canRedo, false);
  v.hist.undo(); assert.equal(c.state.histAnim, true, 'tiles glide'); after(c);
  assert.deepEqual(readout(c), ['0𝑣 + 0']);
  assert.equal(c.renderVals().hist.canRedo, true);
  c.renderVals().hist.redo(); after(c);
  assert.deepEqual(readout(c), ['(0 + 0)𝑣 + 0']);
  c.renderVals().hist.rewind(); after(c);
  assert.deepEqual(readout(c), ['0𝑣']);
  assert.equal(c.renderVals().hist.canUndo, false);
  assert.equal(c.renderVals().hist.canRedo, true, 'redo still walks forward');
  c.renderVals().hist.redo(); after(c);
  assert.deepEqual(readout(c), ['0𝑣 + 0']);
  dragPiece(c, 'PO', ...centre(c, c.state.tops[0].node.vec.id)); after(c);           // a different move
  assert.equal(c.renderVals().hist.canRedo, false, 'what was ahead is gone');
  // restored positions are tidy: the expression's terms in one row
  c.renderVals().hist.undo(); after(c);
  const ys = c.state.tops.filter(t => c.zoneIds.includes(t.node.id)).map(t => { const p = c.P.get(t.node.id); return Math.round(p.y + p.h / 2); });
  assert.equal(new Set(ys).size, 1, 'one row');
});

test('undo sends Lean the move reversed; rewind restarts the proof', () => {
  const calls = [];
  const lean = { setLevel: (a, g) => calls.push(['level', a]), boardChanged: (f, t, h) => calls.push(['move', f, t, h]), subscribe: () => () => {} };
  const c = makeAt({ lean });
  c.renderVals(); c.initLean();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);
  const fwd = calls[calls.length - 1];
  c.renderVals().hist.undo(); after(c);
  const back = calls[calls.length - 1];
  assert.deepEqual([back[1], back[2], back[3]], [fwd[2], fwd[1], fwd[3]]);
  c.renderVals().hist.redo(); after(c);
  c.renderVals().hist.rewind(); after(c);
  assert.equal(calls[calls.length - 1][0], 'level');
});

test('winning marks the node done; levels keep their place when you switch away and back', () => {
  const store = freshStore();
  const c = makeAt({ store });
  after(c);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);
  c.switchLevel('1.32');
  assert.equal(c.state.level, '1.32');
  c.renderVals(); c.noteBoard(); after(c);
  assert.deepEqual(readout(c), ['−1𝑣']);
  c.switchLevel('1.30'); c.renderVals(); c.noteBoard(); after(c);
  assert.deepEqual(readout(c), ['0𝑣 + 0'], 'back where it was left');
  assert.equal(c.renderVals().hist.canUndo, true);
  // a new page load from the same store resumes 1.30 too
  const c2 = makeLive({ store }); c2.renderVals();
  assert.equal(c2.state.level, '1.30');
  assert.deepEqual(readout(c2), ['0𝑣 + 0']);
});

test('level 1.32 can be won with 1.30 unlocked: (−1)𝑣 → … → −𝑣', () => {
  const store = freshStore({ v: 2, done: levelsMod.START_DONE.concat(['1.27', '1.30']), current: '1.32', places: {} });
  const c = makeLive({ store }); after(c);
  assert.deepEqual(readout(c), ['−1𝑣']);
  const T = c.state.tops[0].node;
  dragPiece(c, 'PZ', ...centre(c, T.vec.id)); after(c);                              // −1𝑣 + 0
  tap(c, T.vec.id);
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, '𝑣', ...centre(c, z.id)); after(c);                                    // −1𝑣 + 𝑣 + −𝑣
  assert.deepEqual(readout(c), ['−1𝑣 + 𝑣 + −𝑣']);
  const lone = c.state.tops.find(t => t.node.t === 'v' && !t.node.neg).node;
  dragPiece(c, 'PO', ...centre(c, lone.id)); after(c);                               // −1𝑣 + 1𝑣 + −𝑣
  assert.deepEqual(readout(c), ['−1𝑣 + 1𝑣 + −𝑣']);
  const prods = c.state.tops.filter(t => t.node.t === 'prod').map(t => t.node);
  dragTo(c, prods[1].vec.id, ...centre(c, prods[0].vec.id)); after(c);              // (−1 + 1)𝑣 + −𝑣
  assert.deepEqual(readout(c), ['(−1 + 1)𝑣 + −𝑣']);
  const G = c.state.tops.find(t => t.node.t === 'prod').node.factors[0];
  dragTo(c, G.terms[1].node.id, ...centre(c, G.terms[0].node.id)); after(c);        // 0𝑣 + −𝑣
  assert.deepEqual(readout(c), ['0𝑣 + −𝑣']);
  const P = c.state.tops.find(t => t.node.t === 'prod').node;
  dragTo(c, P.factors[0].id, ...centre(c, P.vec.id)); after(c);                     // 0 + −𝑣 (1.30, unlocked)
  assert.deepEqual(readout(c), ['0 + −𝑣']);
  const z2 = c.state.tops.find(t => t.node.key === 'zero').node, nv = c.state.tops.find(t => t.node.neg).node;
  dragTo(c, z2.id, ...centre(c, nv.id)); after(c);                                  // −𝑣
  assert.deepEqual(readout(c), ['−𝑣']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.32'));
});

test('0𝑣 = 0 is not a move inside level 1.30 itself', () => {
  const c = makeAt({}); after(c);
  const P = c.state.tops[0].node;
  dragTo(c, P.factors[0].id, ...centre(c, P.vec.id)); after(c);
  assert.deepEqual(readout(c), ['0𝑣']);
});

test('graph: a node with some prerequisites done shows (dotted from the missing ones); tapping it pulses what is missing', async () => {
  const { nodeState, ConceptGraph } = await import('../src/graph/ConceptGraph.js');
  const done = new Set(levelsMod.START_DONE.concat(['1.27']));
  assert.equal(nodeState('1.32', done, '1.30'), 'partial', '1.27 done, 1.30 being played: shown, not playable');
  assert.equal(nodeState('1.34', done, '1.30'), 'hidden', 'its missing prerequisites are not on screen');
  const g = new ConceptGraph({ done: [...done], active: '1.30', levels: ['1.30', '1.32'] });
  g.setState = function (o) { Object.assign(this.state, o); };
  const n32 = (await import('../src/graph/data.js')).NODES.find(n => n.id === '1.32');
  g.tap(n32, ['1.30']);
  assert.equal(g.state.sel, null, 'no sheet');
  assert.deepEqual(g.state.pulse.missing, ['1.30']);
  assert.equal(g.state.pulse.to, '1.32');
  done.add('1.30');
  assert.equal(nodeState('1.32', done, '1.32'), 'active');
  assert.equal(nodeState('1.32', done, '1.30'), 'next');
});

test('graph: a finished node leading to a still-hidden one shows a fading line, not the node', async () => {
  const { nodeState, stubsFor } = await import('../src/graph/ConceptGraph.js');
  // 1.33 and 1.36 done, 1.32 not: 1.34 isn't ready, so 1.40 (needs 1.36 and 1.34) stays hidden
  const done = new Set([...levelsMod.START_DONE, '1.33', '1.36']);
  assert.equal(nodeState('1.40', done, '1.30'), 'hidden');
  assert.deepEqual(stubsFor(done, '1.30').filter(([d, n]) => n === '1.40'), [['1.36', '1.40']], 'a line fades out from 1.36 toward it');
  assert.ok(stubsFor(done, '1.30').every(([d, n]) => done.has(d) && nodeState(n, done, '1.30') === 'hidden'));
  // once 1.32 is done too, 1.34 is ready, so 1.40 shows (partly unlocked) and its stub becomes a real line
  done.add('1.30'); done.add('1.32');
  assert.equal(nodeState('1.40', done, '1.34'), 'partial');
  assert.equal(stubsFor(done, '1.34').filter(([d, n]) => n === '1.40').length, 0);
});

test('dragging a group from the tree: the finger decides the target, whatever part of the group is over it', () => {
  const c = makeLevel();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id));  // 0𝑣 + 0
  tap(c, c.state.tops[0].node.vec.id);
  tapTree(c, '·');                                                // −(0𝑣): a wide group
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  c.renderVals(); const p = c.P.get(z.id);
  // the finger near the 0's left edge: the group's centre is far from the 0, but the finger is on it
  const hover = dragTree(c, 'neg', p.x + 12, p.y + p.h / 2);
  assert.equal(hover && hover.id, z.id);
  assert.deepEqual(readout(c), ['0𝑣 − (0𝑣) + 0𝑣']);
});

test('double-tapping a + in the expression lines the terms up in a row that stays below the readout', () => {
  const c = makeLive();            // demo board: (2 + 3)𝑣 above, −1𝑣 lower and to the right
  c.renderVals();
  c.arrange('zone'); c.renderVals();
  const boxes = c.state.tops.filter(t => c.zoneIds.includes(t.node.id)).map(t => c.P.get(t.node.id));
  const cys = boxes.map(p => Math.round(p.y + p.h / 2));
  assert.equal(new Set(cys).size, 1, 'one row');
  assert.ok(boxes.every(p => p.y >= c.K.ZT + 104), 'nothing rises into the heading and readout');
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + −1𝑣']);
});

test('double-tapping a + inside a bracket aligns its terms on the first one', () => {
  const c = makeLive();
  const G = c.state.tops[0].node.factors[0];
  G.terms[1].y = 60;               // knock the 3 out of line
  c.renderVals(); const y0 = c.P.get(G.terms[0].node.id).y;
  c.arrange(G.id); c.renderVals();
  const G2 = c.state.tops[0].node.factors[0];
  const ys = G2.terms.map(t => Math.round(c.P.get(t.node.id).y));
  assert.equal(new Set(ys).size, 1, 'one row');
  assert.equal(ys[0], Math.round(c.P.get(G2.terms[0].node.id).y));
});

// drag a hypothesis card from the tray, the finger ending at (tx, ty)
function dragHyp(c, label, tx, ty) {
  c.setState({ trayOpen: true, trayTab: 'tray' });
  const h = c.renderVals().tray.hyps.find(x => x.text.startsWith(label + ' :'));
  h.down(ev(0, 0)); c.hmove(ev(tx / 2, ty / 2)); c.renderVals(); c.hmove(ev(tx, ty)); c.renderVals();
  const hover = c.state.zeroHover; c.hend(); c.renderVals(); return hover;
}

test('level 1.27: unique additive inverse, with hypotheses h and h′ as moves; Lean gets them in the theorem', () => {
  const calls = [];
  const lean = { setLevel: (a, g, hy) => calls.push(['level', a, g, hy]), boardChanged: (f, t, hn) => calls.push(['move', f, t, hn]), subscribe: () => () => {} };
  const c = makeLive({ store: freshStore({ done: levelsMod.START_DONE, current: '1.27', places: {} }), lean });
  after(c); c.initLean();
  assert.deepEqual(readout(c), ['𝑤']);
  const v = c.renderVals();
  assert.equal(v.heads[1].title, 'GOAL · 1.27');
  assert.equal(v.heads[0].rows.length, 3, 'ASSUMPTIONS: the space, the vectors, the hypotheses');
  assert.equal(v.heads[0].rows[2].map(k => k.t).join(''), '(h : 𝑣 + 𝑤 = 0)   (h′ : 𝑣 + 𝑤′ = 0)');
  assert.ok(c.K.ZT > 300, 'the expression sits lower to make room');
  assert.deepEqual(calls[0][3], [[{ add: [{ v: 'v' }, { v: 'w' }] }, { zero: true }], [{ add: [{ v: 'v' }, { v: 'w2' }] }, { zero: true }]]);
  // 𝑤 → 𝑤 + 0
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.id)); after(c);
  assert.deepEqual(readout(c), ['𝑤 + 0']);
  // h′ (right to left) on the 0: 𝑤 + 𝑣 + 𝑤′
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  const hov = dragHyp(c, 'h′', ...centre(c, z.id));
  assert.equal(hov.id, z.id);
  after(c);
  assert.deepEqual(readout(c), ['𝑤 + 𝑣 + 𝑤′']);
  assert.deepEqual(calls.slice(-2).map(x => x[3]), [['h2'], null], 'h2 makes the bracketed pair, then it opens');
  // move 𝑤 after 𝑣: 𝑣 + 𝑤 + 𝑤′
  const w = c.state.tops.find(t => t.node.key === 'w').node, vv = c.state.tops.find(t => t.node.key === 'v').node;
  c.renderVals(); const pv = c.P.get(vv.id), pw = c.P.get(w.id);
  dragTo(c, w.id, pv.x + pv.w + 26 + 70, pv.y + 44 + 140);     // out of the way first
  c.renderVals(); const pv2 = c.P.get(vv.id), pw2 = c.P.get(c.state.tops.find(t => t.node.key === 'w2').node.id);
  dragTo(c, w.id, (pv2.x + pv2.w + pw2.x) / 2, pv2.y + 44); after(c);
  assert.deepEqual(readout(c), ['𝑣 + 𝑤 + 𝑤′']);
  // h (left to right) on 𝑣: 0 + 𝑤′
  const v2 = c.state.tops.find(t => t.node.key === 'v').node;
  dragHyp(c, 'h', ...centre(c, v2.id)); after(c);
  assert.deepEqual(readout(c), ['0 + 𝑤′']);
  assert.deepEqual(calls[calls.length - 1][3], ['h1']);
  // absorb the 0: 𝑤′
  const z2 = c.state.tops.find(t => t.node.key === 'zero').node, w2 = c.state.tops.find(t => t.node.key === 'w2').node;
  dragTo(c, z2.id, ...centre(c, w2.id)); after(c);
  assert.deepEqual(readout(c), ['𝑤′']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.27'));
});

test('definitions have no level: one counts as done once its prerequisites are; results need theirs won', async () => {
  const { nodeState, effectiveDone } = await import('../src/graph/ConceptGraph.js');
  const done = new Set(DONE0);
  assert.equal(nodeState('1.33', done, '1.30'), 'done', 'subspace (a definition) follows from 1.20');
  assert.ok(effectiveDone(done).has('1.36') && effectiveDone(done).has('1.41'), 'and the definitions after it');
  assert.equal(nodeState('1.26', done, '1.30'), 'next'); assert.equal(nodeState('1.31', done, '1.30'), 'next');
  assert.equal(nodeState('1.45', done, '1.30'), 'next', 'a result whose prerequisites are all definitions');
});

test('before 1.27 is won there is no −𝑥 for vectors: the tree offers ∃𝑤, and a plain vector split is refused', () => {
  const c = makeFresh(); after(c);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);     // 0𝑣 + 0
  tap(c, c.state.tops[0].node.vec.id);
  tapTree(c, '·');
  assert.deepEqual(c.renderVals().tray.tree.wraps.map(w => w.kind), ['wit'], 'the inverse axiom, not −');
  tapTree(c, '·');
  tapTree(c, '𝑣');
  assert.ok(!treeItem(c, '−𝑣'), 'no night 𝑣');
  tapTree(c, '𝑣');                                                             // back to plain
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, '𝑣', ...centre(c, z.id));
  assert.deepEqual(readout(c), ['0𝑣 + 0'], 'refused: it would make −𝑣');
  assert.match(c.state.flash.text, /needs 1.27/);
});

test('1.30 by the inverse axiom: 0𝑣 = 0𝑣 + 0 = 0𝑣 + (0𝑣 + 𝑤₁) = (0 + 0)𝑣 + 𝑤₁ = 0𝑣 + 𝑤₁ = 0, no negatives', () => {
  const calls = [];
  const lean = { setLevel: (a, g, hy) => calls.push(['level', a, g, hy]), boardChanged: (f, t, hn, w) => calls.push(['move', f, t, hn, w]), subscribe: () => () => {} };
  const c = makeLive({ store: memoryStore(), lean }); after(c); c.initLean();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);     // 0𝑣 + 0
  tap(c, c.state.tops[0].node.vec.id); tapTree(c, '·');                          // ∃𝑤 on 0𝑣
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, 'wit', ...centre(c, z.id)); after(c);
  assert.deepEqual(readout(c), ['0𝑣 + 0𝑣 + 𝑤₁']);
  const card = c.state.hyps.find(h => h.wit);
  assert.equal(card.label, 'h₁'); assert.equal(card.name, 'h1');
  const wstep = calls.find(x => x[0] === 'move' && x[4]);
  assert.deepEqual(wstep[4], { x: { smul: [{ n: 0 }, { v: 'v' }] }, name: 'y1', h: 'h1' }, 'Lean obtains the witness');
  assert.deepEqual(wstep[3], ['h1']);
  const ps = c.state.tops.filter(t => t.node.t === 'prod').map(t => t.node);
  dragTo(c, ps[1].vec.id, ...centre(c, ps[0].vec.id)); after(c);                // (0 + 0)𝑣 + 𝑤₁
  assert.deepEqual(readout(c), ['(0 + 0)𝑣 + 𝑤₁']);
  const G = c.state.tops.find(t => t.node.t === 'prod').node.factors[0];
  dragTo(c, G.terms[1].node.id, ...centre(c, G.terms[0].node.id)); after(c);    // 0𝑣 + 𝑤₁
  assert.deepEqual(readout(c), ['0𝑣 + 𝑤₁']);
  dragHyp(c, 'h₁', ...centre(c, c.state.tops.find(t => t.node.t === 'prod').node.vec.id)); after(c);
  assert.deepEqual(readout(c), ['0']);
  assert.equal(c.renderVals().won, true);
  // undo takes the card away with the move; redo brings it back
  c.renderVals().hist.undo(); after(c); c.renderVals().hist.undo(); after(c); c.renderVals().hist.undo(); after(c); c.renderVals().hist.undo(); after(c);
  assert.equal(c.state.hyps.filter(h => h.wit).length, 0);
  c.renderVals().hist.redo(); after(c);
  assert.equal(c.state.hyps.filter(h => h.wit).length, 1);
});

test('level 1.31: 𝑎0 = 0 the same way, with a symbolic scalar 𝑎', () => {
  const c = makeLive({ store: memoryStore({ done: DONE0, current: '1.31', places: {} }) }); after(c);
  assert.deepEqual(readout(c), ['𝑎0']);
  assert.ok(c.renderVals().heads[0].tokens.map(k => k.t).join('').includes('(𝑎 : ℝ)'));
  assert.deepEqual(c.leanTree(c.state.tops[0].node), { smul: [{ s: 'a' }, { zero: true }] });
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);     // 𝑎0 + 0
  assert.deepEqual(readout(c), ['𝑎0 + 0']);
  const P0 = c.state.tops.find(t => t.node.t === 'prod').node;
  tap(c, P0.factors[0].id); tapTree(c, '·');
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, 'wit', ...centre(c, z.id)); after(c);                             // 𝑎0 + 𝑎0 + 𝑤₁
  assert.deepEqual(readout(c), ['𝑎0 + 𝑎0 + 𝑤₁']);
  const ps = c.state.tops.filter(t => t.node.t === 'prod').map(t => t.node);
  dragTo(c, ps[1].factors[0].id, ...centre(c, ps[0].factors[0].id)); after(c);  // 𝑎(0 + 0) + 𝑤₁
  assert.deepEqual(readout(c), ['𝑎(0 + 0) + 𝑤₁']);
  const S = c.state.tops.find(t => t.node.t === 'prod').node.vec;
  dragTo(c, S.terms[1].node.id, ...centre(c, S.terms[0].node.id)); after(c);    // 𝑎0 + 𝑤₁
  assert.deepEqual(readout(c), ['𝑎0 + 𝑤₁']);
  dragHyp(c, 'h₁', ...centre(c, c.state.tops.find(t => t.node.t === 'prod').node.factors[0].id)); after(c);
  assert.deepEqual(readout(c), ['0']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.31'));
});

test('a witness adds its own ASSUMPTIONS line; GOAL, EXPRESSION and the tiles move down by exactly that, and back on undo', () => {
  const c = makeFresh(); after(c);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);     // 0𝑣 + 0
  const ZT0 = c.K.ZT, GY0 = c.K.GY;
  const ys = () => c.state.tops.map(t => { const p = c.P.get(t.node.id); return Math.round(p.y + p.h / 2); });
  const before = ys();
  tap(c, c.state.tops[0].node.vec.id); tapTree(c, '·');
  assert.deepEqual(c.renderVals().tray.tree.wraps.map(w => w.kind), ['wit'], 'the existence bubble');
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, 'wit', ...centre(c, z.id)); after(c);
  const v = c.renderVals();
  assert.equal(c.K.ZT - ZT0, 58); assert.equal(c.K.GY - GY0, 58);
  const row = v.heads[0].rows[v.heads[0].rows.length - 1];
  assert.equal(row.map(k => k.t).join(''), '(𝑤₁ : 𝑉)   (h₁ : 0𝑣 + 𝑤₁ = 0)');
  assert.ok(row.find(k => k.hyp), 'its hypothesis can be dragged from there');
  // every tile is still in the expression, one row, below the readout
  assert.equal(c.zoneIds.length, c.state.tops.length);
  const now = ys();
  assert.equal(new Set(now).size, 1, 'one row');
  assert.ok(now[0] >= before[0] + 58 - 1, 'the row moved down with the header');
  // drag the hypothesis from ASSUMPTIONS onto 0𝑣 (with 𝑤₁ after it): the pair becomes 0 … after factoring; here just check the hover
  c.renderVals().hist.undo(); after(c);
  assert.equal(c.K.ZT, ZT0, 'undo takes the line away and everything moves back up');
  assert.equal(c.zoneIds.length, c.state.tops.length);
});

test('a hypothesis dragged from ASSUMPTIONS rewrites like its card', () => {
  const c = makeLive({ store: memoryStore({ done: DONE0, current: '1.27', places: {} }) }); after(c);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.id)); after(c);         // 𝑤 + 0
  const tok = c.renderVals().heads[0].tokens.find(k => k.hyp && k.hyp.label === 'h′');
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  const [tx, ty] = centre(c, z.id);
  c.hypDown(tok.hyp, tok.t)(ev(0, 0)); c.hmove(ev(tx / 2, ty / 2)); c.renderVals(); c.hmove(ev(tx, ty)); c.renderVals();
  assert.equal(c.state.zeroHover && c.state.zeroHover.id, z.id);
  c.hend(); after(c);
  assert.deepEqual(readout(c), ['𝑤 + 𝑣 + 𝑤′']);
});

test('progress saved before 1.27 had a level loses its unearned 1.27 once; later progress keeps it', () => {
  const old = memoryStore({ done: DONE0.concat(['1.27', '1.30']), current: '1.30', places: {} });
  const c = makeLive({ store: old }); c.renderVals();
  assert.ok(!c.prog.done.includes('1.27') && c.prog.done.includes('1.30'));
  assert.equal(c.has127(), false);
  const won = memoryStore({ v: 2, done: DONE0.concat(['1.27']), current: '1.30', places: {} });
  const c2 = makeLive({ store: won }); c2.renderVals();
  assert.equal(c2.has127(), true);
});

test('winning shows "You won!" with a button that opens the TOOLS tab', () => {
  const c = makeLive({ store: memoryStore({ v: 2, done: DONE0, current: '1.30', places: {} }) });
  let v = c.renderVals();
  assert.equal(v.won, false);
  c.setState({ tops: [{ node: c.mkV('𝑉', '0', 'zero', 'R', 110), x: 40, y: c.K.ZT + 60 }] });
  v = c.renderVals();
  assert.equal(v.won, true);
  v.pickLevel();
  assert.equal(c.state.trayTab, 'tools'); assert.equal(c.state.trayOpen, true);
});

test('level 1.26: unique 0, a ∀ hypothesis whose 𝑣 matches any vector: 0′ = 0′ + 0 = 0 + 0′ = 0', () => {
  const calls = [];
  const lean = { setLevel: (a, g, hy) => calls.push(['level', a, g, hy]), boardChanged: (f, t, hn) => calls.push(['move', f, t, hn]), subscribe: () => () => {} };
  const c = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE, current: '1.26', places: {} }), lean });
  after(c); c.initLean();
  assert.deepEqual(readout(c), ['0′']);
  const v = c.renderVals();
  assert.equal(v.heads[0].rows[2].map(k => k.t).join(''), '(h : ∀𝑣 : 𝑉, 𝑣 + 0′ = 𝑣)');
  assert.deepEqual(calls[0][3], [[{ add: [{ v: 'v' }, { v: 'o' }] }, { v: 'v' }, 'v']], 'Lean gets the bound name');
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.id)); after(c);
  assert.deepEqual(readout(c), ['0′ + 0']);
  // h doesn't fit 0′ + 0 (no 0′ after the first term) except as its right-hand side, 𝑣 → 𝑣 + 0′, on a single term
  const o = c.state.tops.find(t => t.node.key === 'o').node, z = c.state.tops.find(t => t.node.key === 'zero').node;
  c.renderVals(); const pz = c.P.get(z.id);
  dragTo(c, o.id, pz.x + pz.w + 26 + 60, pz.y + 44); after(c);              // 0′ after 0
  assert.deepEqual(readout(c), ['0 + 0′']);
  const hov = dragHyp(c, 'h', ...centre(c, z.id)); after(c);
  assert.ok(hov && hov.hyp && hov.hyp.dir === 'fwd', 'on 0 + 0′ it reads left to right, 𝑣 = 0');
  assert.deepEqual(readout(c), ['0']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.26'));
  assert.deepEqual(calls.filter(x => x[0] === 'move').map(x => x[3]), [['add_zero'], null, ['h1']]);
});

test('the variables in ASSUMPTIONS are in the tray too: drag one onto a 0, or tap it for its tree', () => {
  const c27 = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE, current: '1.27', places: {} }) }); after(c27);
  const els = n => n.map(x => x.el);
  assert.deepEqual(els(c27.varItems()), ['𝑣', '𝑤', '𝑤′']);
  const c31 = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE, current: '1.31', places: {} }) }); after(c31);
  assert.deepEqual(c31.varItems().map(n => [n.t, n.el, n.val || n.key]), [['s', '𝑎', 'a'], ['v', '𝑣', 'v']]);
  // 1.30 with 1.27 won: 0𝑣 + 0, then the tray's 𝑣 onto the 0 makes 𝑣 + −𝑣
  const c = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE.concat(['1.27']), current: '1.30', places: {} }) }); after(c);
  assert.equal(c.renderVals().tray.list.length, 4, '0, 0, 1 and 𝑣');
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  c.setState({ trayOpen: true, trayTab: 'tray' });
  const vt = c.renderVals().tray.list[3].t;
  vt.down(ev(0, 0)); const [tx, ty] = centre(c, z.id);
  c.imove(ev(tx / 2, ty / 2)); c.renderVals(); c.imove(ev(tx, ty)); c.renderVals(); c.iend(); after(c);
  assert.deepEqual(readout(c), ['0𝑣 + 𝑣 + −𝑣']);
  // a tap shows it as a tree
  c.setState({ trayOpen: true, trayTab: 'tray' });
  c.renderVals().tray.list[3].t.down(ev(0, 0)); c.iend(); c.renderVals();
  assert.equal(c.state.tree.root.el, '𝑣');
});

test('workspaces: a double tap on a hypothesis brings its equation into the box; moves there change it; back out, the expression is as it was', () => {
  const calls = [];
  const lean = { setLevel: (a, g, hy) => calls.push(['level', a, g, hy]), boardChanged: (f, t, h, w, tg) => calls.push(['move', f, t, h, tg]), subscribe: () => () => {} };
  const c = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE, current: '1.27', places: {} }), lean });
  after(c); c.initLean();
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.id)); after(c);       // 𝑤 + 0 in the expression
  assert.deepEqual(readout(c), ['𝑤 + 0']);
  // double tap h′ in ASSUMPTIONS (two taps close together)
  c.headTap('h2', null, 1000); c.headTap('h2', null, 1200); after(c);
  assert.equal(c.state.ws, 'h2');
  assert.deepEqual(readout(c), ['𝑣 + 𝑤′ = 0']);
  let v = c.renderVals();
  assert.equal(v.boxTitle, 'HYPOTHESIS h′');
  assert.ok(v.eqSign, 'the = sits at the start of the second row');
  const mini = v.heads[0].rows[2].find(k => k.slot);
  assert.equal(mini.t, '𝑤 + 0', 'the expression waits where h′ was');
  // a move on h′: reorder its left side, 𝑤′ + 𝑣 = 0
  const vv = c.state.tops.find(t => t.node.key === 'v').node, w2 = c.state.tops.find(t => t.node.key === 'w2').node;
  c.renderVals(); const p2 = c.P.get(w2.id), pv = c.P.get(vv.id);
  dragTo(c, w2.id, pv.x - 30, pv.y + 44); after(c);
  assert.deepEqual(readout(c), ['𝑤′ + 𝑣 = 0']);
  assert.equal(c.exprText(c.state.hyps.find(h => h.name === 'h2').lhs, true), '𝑤′ + 𝑣', 'the hypothesis itself changed');
  const last = calls[calls.length - 1];
  assert.deepEqual(last[4], { hyp: 'h2', bind: null }, 'Lean gets a hypothesis step');
  assert.deepEqual(last[1], [{ add: [{ v: 'v' }, { v: 'w2' }] }, { zero: true }]);
  assert.deepEqual(last[2], [{ add: [{ v: 'w2' }, { v: 'v' }] }, { zero: true }]);
  // a term can't cross the =
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  c.renderVals(); const pz = c.P.get(z.id);
  dragTo(c, z.id, pz.x + 40, c.K.ZT + 159); after(c);
  assert.deepEqual(readout(c), ['𝑤′ + 𝑣 = 0'], 'dragged across the =, it goes back');
  // back to the expression (double tap the small box): as it was
  c.headTap('expr', null, 5000); c.headTap('expr', null, 5100); after(c);
  assert.equal(c.state.ws, 'expr');
  assert.deepEqual(readout(c), ['𝑤 + 0']);
  v = c.renderVals();
  assert.equal(v.heads[0].rows[2].map(k => k.t).join(''), '(h : 𝑣 + 𝑤 = 0)   (h′ : 𝑤′ + 𝑣 = 0)');
  // and h′ as it is now works as a card: on the 0 it gives 𝑤′ + 𝑣
  const z2 = c.state.tops.find(t => t.node.key === 'zero').node;
  dragHyp(c, 'h′', ...centre(c, z2.id)); after(c);
  assert.deepEqual(readout(c), ['𝑤 + 𝑤′ + 𝑣']);
  // one history for every board; undo leaves the expression in the box: undoing the move made on h′ only changes
  // h′'s text in the header
  c.undo(); after(c);
  assert.deepEqual(readout(c), ['𝑤 + 0']);
  c.undo(); after(c);
  assert.equal(c.state.ws, 'expr', 'the box keeps the expression');
  assert.deepEqual(readout(c), ['𝑤 + 0']);
  assert.equal(c.renderVals().heads[0].rows[2].map(k => k.t).join(''), '(h : 𝑣 + 𝑤 = 0)   (h′ : 𝑣 + 𝑤′ = 0)', 'h′ is back as it was');
  c.redo(); after(c);
  assert.equal(c.renderVals().heads[0].rows[2].map(k => k.t).join(''), '(h : 𝑣 + 𝑤 = 0)   (h′ : 𝑤′ + 𝑣 = 0)');
  // with h′ in the box, undoing a move made on the expression changes the small EXPRESSION box's text
  c.redo(); after(c);
  c.headTap('h2', null, 9000); c.headTap('h2', null, 9100); after(c);
  assert.equal(c.renderVals().heads[0].rows[2].find(k => k.slot).t, '𝑤 + 𝑤′ + 𝑣');
  c.undo(); after(c);
  assert.equal(c.state.ws, 'h2');
  assert.deepEqual(readout(c), ['𝑤′ + 𝑣 = 0']);
  assert.equal(c.renderVals().heads[0].rows[2].find(k => k.slot).t, '𝑤 + 0');
});

test('workspaces: the goal can be worked on too, and the level is won when the expression meets it', () => {
  const calls = [];
  const lean = { setLevel: (a, g, hy) => calls.push(['level', a, g, hy]), boardChanged: (f, t, h, w, tg) => calls.push(['move', f, t, h, tg]), subscribe: () => () => {} };
  const c = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE, current: '1.26', places: {} }), lean });
  after(c); c.initLean();
  // double tap GOAL: 0 comes into the box; the expression waits on the GOAL line
  const g = c.renderVals().heads[1];
  c.headTap('goal', null, 100); c.headTap('goal', null, 300); after(c);
  assert.equal(c.state.ws, 'goal');
  assert.deepEqual(readout(c), ['0']);
  const v = c.renderVals();
  assert.equal(v.heads[1].title, 'EXPRESSION');
  assert.equal(v.boxTitle, 'GOAL · 1.26');
  // on the goal: 0 → 0 + 0′ (h, right to left: 𝑣 = 𝑣 + 0′)
  const z = c.state.tops[0].node;
  dragHyp(c, 'h', ...centre(c, z.id)); after(c);
  assert.deepEqual(readout(c), ['0 + 0′']);
  assert.equal(c.exprText([c.state.goal], true), '(0 + 0′)', 'the goal itself changed');
  assert.deepEqual(calls[calls.length - 1][4], { goal: true });
  assert.equal(c.renderVals().won, false);
  // back to the expression: 0′ → 0′ + 0, then 0 + 0′: it meets the goal
  c.headTap('expr', null, 900); c.headTap('expr', null, 1000); after(c);
  assert.deepEqual(readout(c), ['0′']);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.id)); after(c);
  const o = c.state.tops.find(t => t.node.key === 'o').node, z0 = c.state.tops.find(t => t.node.key === 'zero').node;
  c.renderVals(); const pz = c.P.get(z0.id);
  dragTo(c, o.id, pz.x + pz.w + 26 + 60, pz.y + 44); after(c);
  assert.deepEqual(readout(c), ['0 + 0′']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.26'));
  // Lean was told the level as stated (goal 0), then the steps
  assert.deepEqual(calls[0][2], { zero: true });
});

test('workspaces: two taps far apart are two single taps (each switches the tiles), not a double tap', () => {
  const c = makeLive({ store: freshStore({ v: 2, done: levelsMod.START_DONE, current: '1.27', places: {} }) });
  after(c);
  let toggled = 0;
  c.headTap('goal', () => { toggled++; }, 0);      // (outside a browser the toggle runs at once)
  c.headTap('goal', () => { toggled++; }, 2000);  // too late to be a double tap: no switch, two toggles
  assert.equal(toggled, 2);
  assert.equal(c.state.ws, 'expr');
});

test('factoring terms that aren\'t together: Lean first gets them brought together (bracketed), then the law', () => {
  const calls = [];
  const lean = { setLevel: () => {}, boardChanged: (f, t, h) => calls.push([f, t, h]), subscribe: () => () => {} };
  const c = makeLive({ lean, store: memoryStore({ v: 2, done: DONE0.concat(['1.27']) }) }); c.initLean();
  const T = c.state.tops[0].node;
  dragPiece(c, 'PZ', ...centre(c, T.vec.id)); after(c);
  tap(c, T.vec.id); tapTree(c, '·');
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, 'neg', ...centre(c, z.id)); after(c);
  assert.deepEqual(readout(c), ['0𝑣 − (0𝑣) + 0𝑣']);
  const prods = c.state.tops.filter(t => t.node.t === 'prod' && !c.flagged(t.node)).map(t => t.node);
  const n0 = calls.length;
  dragTo(c, prods[1].vec.id, ...centre(c, prods[0].vec.id)); after(c);
  assert.deepEqual(readout(c), ['(0 + 0)𝑣 − (0𝑣)']);
  const zv = { smul: [{ n: 0 }, { v: 'v' }] };
  assert.deepEqual(calls.slice(n0), [
    [{ add: [zv, { neg: zv }, zv] }, { add: [{ add: [zv, zv] }, { neg: zv }] }, null],
    [{ add: [{ add: [zv, zv] }, { neg: zv }] }, { add: [{ smul: [{ add: [{ n: 0 }, { n: 0 }] }, { v: 'v' }] }, { neg: zv }] }, ['add_smul']]]);
});

test('factoring a bare vector: Lean first gets it written 1·𝑣 (one_smul), then the law', () => {
  const calls = [];
  const lean = { setLevel: () => {}, boardChanged: (f, t, h) => calls.push([f, t, h]), subscribe: () => () => {} };
  const store = freshStore({ v: 2, done: levelsMod.START_DONE.concat(['1.27', '1.30']), current: '1.32', places: {} });
  const c = makeLive({ store, lean }); after(c); c.initLean();
  const T = c.state.tops[0].node;
  dragPiece(c, 'PZ', ...centre(c, T.vec.id)); after(c);
  tap(c, T.vec.id);
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  dragTree(c, '𝑣', ...centre(c, z.id)); after(c);
  assert.deepEqual(readout(c), ['−1𝑣 + 𝑣 + −𝑣']);
  const lone = c.state.tops.find(t => t.node.t === 'v' && !t.node.neg).node;
  const n0 = calls.length;
  dragTo(c, lone.id, ...centre(c, T.vec.id)); after(c);
  assert.deepEqual(readout(c), ['(−1 + 1)𝑣 + −𝑣']);
  const v = { v: 'v' }, m1 = { smul: [{ n: -1 }, v] }, nv = { neg: v };
  assert.deepEqual(calls.slice(n0), [
    [{ add: [m1, v, nv] }, { add: [m1, { smul: [{ n: 1 }, v] }, nv] }, ['one_smul']],
    [{ add: [m1, { smul: [{ n: 1 }, v] }, nv] }, { add: [{ smul: [{ add: [{ n: -1 }, { n: 1 }] }, v] }, nv] }, ['add_smul']]]);
});

// 1.34: a card from ASSUMPTIONS (or the tray) dropped on a tile
function dragCard(c, name, tx, ty) {
  c.setState({ trayOpen: true, trayTab: 'tray' });
  const h = c.renderVals().tray.hyps.find(x => x.text.startsWith(name + ' :'));
  assert.ok(h, 'card ' + name);
  h.down(ev(0, 0)); c.hmove(ev(tx / 2, ty / 2)); c.renderVals(); c.hmove(ev(tx, ty)); c.renderVals();
  const hover = c.state.zeroHover; c.hend(); c.renderVals(); return hover;
}
const make134 = (goal, lean, done) => {
  const store = freshStore({ v: 2, done: levelsMod.START_DONE.concat(['1.27', '1.30', '1.32'], done || []), current: '1.34/' + goal, places: {} });
  const c = makeLive({ store, lean }); after(c); if (lean) c.initLean(); return c;
};

test('1.34, goal 7 (−𝑢 ∈ 𝑈): 1.32 turns −𝑢 into (−1)𝑢, hs leaves 𝑢, hu closes it; Lean gets each as a step', () => {
  const calls = [];
  const lean = { setLevel: (a, g, hy, m) => calls.push(['level', a, g, hy, m]), boardChanged: (f, t, h, w, tg) => calls.push(['move', f, t, h, tg]), subscribe: () => () => {} };
  const c = make134(7, lean);
  let v = c.renderVals();
  assert.equal(v.heads[1].title, 'GOAL 7 OF 12 · 1.34 · ⇐');
  assert.equal(v.goalChips.items.length, 12);
  assert.ok(v.goalChips.items[6].cur);
  assert.deepEqual(readout(c), ['−𝑢 ∈ 𝑈']);
  assert.deepEqual(calls[0].slice(1), [{ neg: { v: 'u' } }, null, [], { ctx: 'closed', mems: ['u'], scalars: [], vectors: [] }]);
  const u = () => c.state.tops[0].node;
  dragCard(c, 'hu', ...centre(c, u().id));                       // hu doesn't fit −𝑢
  assert.deepEqual(readout(c), ['−𝑢 ∈ 𝑈']);
  dragCard(c, '1.32', ...centre(c, u().id)); after(c);           // −𝑢 = (−1)𝑢
  assert.deepEqual(readout(c), ['−1𝑢 ∈ 𝑈']);
  dragCard(c, 'hs', ...centre(c, u().vec.id)); after(c);         // enough: 𝑢 ∈ 𝑈
  assert.deepEqual(readout(c), ['𝑢 ∈ 𝑈']);
  dragCard(c, 'hu', ...centre(c, u().id)); after(c);             // and that's hu
  assert.deepEqual(readout(c), ['no goals left']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.34/7') && !c.prog.done.includes('1.34'));
  assert.deepEqual(calls.filter(x => x[0] === 'move').map(x => [x[3], x[4]]),
    [[['neg_one_smul'], { row: 0 }], [['hs'], { row: 0, card: 'hs' }], [['hu'], { row: 0, card: 'hu' }]]);
  assert.deepEqual(calls[1].slice(1, 3), [{ neg: { v: 'u' } }, { smul: [{ n: -1 }, { v: 'u' }] }]);
});

test('1.34, goal 5 (𝑢 + 𝑤 ∈ 𝑈): ha splits it into two goals, one row each; close them in any order', () => {
  const calls = [];
  const lean = { setLevel: () => {}, boardChanged: (f, t, h, w, tg) => calls.push(tg), subscribe: () => () => {} };
  const c = make134(5, lean);
  assert.deepEqual(readout(c), ['𝑢 + 𝑤 ∈ 𝑈']);
  const w = () => c.state.tops.find(t => t.node.key === 'w').node, u = () => c.state.tops.find(t => t.node.key === 'u').node;
  dragCard(c, 'ha', ...centre(c, u().id)); after(c);
  assert.deepEqual(readout(c), ['𝑢 ∈ 𝑈,   𝑤 ∈ 𝑈']);
  assert.equal(c.renderVals().memSigns.length, 2);
  dragCard(c, 'hw', ...centre(c, w().id)); after(c);             // the second goal first
  assert.deepEqual(readout(c), ['𝑢 ∈ 𝑈']);
  dragCard(c, 'hu', ...centre(c, u().id)); after(c);
  assert.equal(c.renderVals().won, true);
  assert.deepEqual(calls, [{ row: 0, card: 'ha' }, { row: 1, card: 'hw' }, { row: 0, card: 'hu' }]);
  // undo on a membership board replays the live proof instead of reversing a card
  c.undo(); after(c);
  assert.deepEqual(readout(c), ['𝑢 ∈ 𝑈']);
});

test('1.34, ⇒ (from h : 𝑈 is a subspace): h does whatever fits, 0 ∈ 𝑈 at once; ⇐ laws are ordinary moves; all twelve win the level', () => {
  const c = make134(1, null, ['1.34/2', '1.34/3', '1.34/4', '1.34/5', '1.34/6', '1.34/7', '1.34/9', '1.34/10', '1.34/11', '1.34/12']);
  assert.deepEqual(readout(c), ['0 ∈ 𝑈']);
  dragCard(c, 'h', ...centre(c, c.state.tops[0].node.id)); after(c);
  assert.equal(c.renderVals().won, true);
  assert.ok(!c.prog.done.includes('1.34'));
  // goal 8, 𝑢 + 𝑤 = 𝑤 + 𝑢: the order counts, so it isn't won before the move
  c.renderVals().goalChips.items[7].tap(); after(c);
  assert.equal(c.state.level, '1.34/8');
  assert.deepEqual(readout(c), ['𝑢 + 𝑤']);
  assert.equal(c.renderVals().won, false);
  const u = c.state.tops.find(t => t.node.key === 'u').node, w = c.state.tops.find(t => t.node.key === 'w').node;
  c.renderVals(); const pw = c.P.get(w.id);
  dragTo(c, u.id, pw.x + pw.w + 26 + 60, pw.y + 44); after(c);
  assert.deepEqual(readout(c), ['𝑤 + 𝑢']);
  assert.equal(c.renderVals().won, true);
  assert.ok(c.prog.done.includes('1.34'), 'every goal done: 1.34 is won');
});

test('TOOLS: Reset progress forgets every win and place after a second tap, back to the first level', () => {
  const store = freshStore({ v: 2, done: levelsMod.START_DONE.concat(['1.27', '1.30', '1.32']), current: '1.32', places: {} });
  const c = makeLive({ store }); after(c);
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);
  assert.ok(store.load().places['1.32']);
  c.resetProgress();
  assert.ok(c.prog.done.includes('1.32'), 'one tap only arms it');
  c.resetProgress();
  assert.deepEqual(c.prog.done, levelsMod.START_DONE);
  assert.equal(c.state.level, levelsMod.FIRST);
  assert.deepEqual(store.load().places, {});
  assert.deepEqual(readout(c), ['0𝑣']);
});
