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
function makeLive() {
  const c = new Range({});
  c.setState = function (o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); };
  c.renderVals();
  return c;
}
const readout = c => c.renderVals().results.map(r => r.main);

test('live board: Rules mode, the tray holds just 0 in ℝ and 0 in 𝑉, and the readout is the expression', () => {
  const c = makeLive();
  assert.equal(c.state.rules, true);
  assert.deepEqual(c.state.pieces.map(p => p.id), ['PZS', 'PZ']);
  const v = c.renderVals();
  assert.equal(v.vecs.length + v.hexes.length, 2 + 3 + 2, 'two vectors, three scalars, and the two tray zeros');
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
  const v = c.state.tops[1].node.vec;
  dragPiece(c, 'PZ', ...centre(c, v.id));                 // (2 + 3)𝑣 + −1𝑣 + 0
  const z = c.state.tops.find(t => t.node.key === 'zero').node;
  const T0 = c.state.tops[0].node;
  dragTo(c, z.id, ...centre(c, T0.vec.id));               // drag that 0 onto (2 + 3)𝑣
  assert.deepEqual(readout(c), ['(2 + 3)𝑣 + 0 + −1𝑣']);
  c.renderVals();
  const tp = c.P.get(T0.id), zp = c.P.get(z.id);
  assert.ok(Math.abs((zp.y + zp.h / 2) - (tp.y + tp.h / 2)) < 2, 'same row as (2 + 3)𝑣');
  assert.ok(zp.x > tp.x + tp.w, 'right after it');
  assert.ok(c.zoneIds.includes(z.id), 'still in the expression');
});
