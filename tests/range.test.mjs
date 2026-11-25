// Logic tests for the Range. Run with: npm test  (node --test, no dependencies)
// The component is driven directly: no DOM, setState applied synchronously, gestures simulated in world units.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Range } from '../src/range/Range.js';

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
  const it = treeItem(c, which); it.down(ev(0, 0));
  const d = c.idrag; const m = c.measure(d.node);
  const dx = tx - (d.ox + m.w / 2), dy = ty - (d.oy + m.h / 2);
  c.imove(ev(dx / 2, dy / 2)); c.renderVals(); c.imove(ev(dx, dy)); c.renderVals();
  const hover = c.state.zeroHover; c.iend(); c.renderVals(); return hover;
}
const tapTree = (c, which) => { treeItem(c, which).down(ev(0, 0)); c.iend(); c.renderVals(); };

// level 1, as it ships
const makeLevel = () => makeLive({});
const tap = (c, id) => { c.renderVals(); c.begin(id, 'self', ev(0, 0)); c.end(); c.renderVals(); };
function dragItem(c, n, tx, ty) {
  const v = c.renderVals(); const t = v.tray.list.filter(x => x.t.el === n)[0].t;
  t.down(ev(0, 0)); const d = c.idrag; const m = c.measure(d.node);
  const dx = tx - (d.ox + m.w / 2), dy = ty - (d.oy + 44);
  c.imove(ev(dx / 2, dy / 2)); c.renderVals(); c.imove(ev(dx, dy)); c.renderVals();
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
  tapTree(c, '−𝑣');
  tapTree(c, '·');
  let T = c.renderVals().tray.tree;
  assert.deepEqual(T.wraps.map(w => w.kind), ['neg']);
  assert.ok(T.boxes[0].neg, 'a night box around the subtree');
  tapTree(c, '·');
  T = c.renderVals().tray.tree;
  assert.equal(T.wraps.length, 0);
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
  const c = makeLive({ lean });
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
  const done = new Set(START_DONE);
  assert.equal(nodeState('1.27', done, '1.30'), 'done'); assert.equal(nodeState('1.30', done, '1.30'), 'active');
  assert.equal(nodeState('1.33', done, '1.30'), 'next', 'one step away: shown grey');
  assert.equal(nodeState('1.32', done, '1.30'), 'hidden', 'two steps away: not shown');
  done.add('1.30');
  assert.equal(nodeState('1.32', done, '1.30'), 'next', 'once 1.30 is done, 1.32 is one step away');
  assert.equal(NODES.length, 20);
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
  dragPiece(c, 'PZ', ...centre(c, c.state.tops[0].node.vec.id)); after(c);            // 0𝑣 + 0
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
  const store = freshStore({ done: levelsMod.START_DONE.concat(['1.30']), current: '1.32', places: {} });
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
