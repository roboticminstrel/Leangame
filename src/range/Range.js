// The Range: an expression playground for scalars, vectors and sums (PROTOTYPE, written by Claude).
// Ported from the design-canvas prototype: same logic class, rendered with Preact + htm (vendored, no build step).
import { Component } from '../../vendor/preact.mjs';
import { html } from '../html.js';

export class Range extends Component {
  constructor(props) {
    super(props);
    this.uid = 1;
    this.K = { BIT: 52, PAREN: 18, SPAD: 18, ZT: 126, ZB: 526, WW: 560, ZW: 110, GAP: 52 };
    this.P = new Map();
    this.M = new Map();
    this.state = this.initialState();
    this.setBoard = el => { this.board = el; };
  }
  nid(p) { return p + (this.uid++); }
  // Negative tiles are "night" tiles: the top band stays, the face goes dark in its own type's tint. A scalar is
  // negative when its value is (−1, −½, −𝑖); a vector when it's an additive inverse −𝑣 (neg: true). The minus
  // is always written on the tile too.
  isNeg(n) { return n.t === 's' ? String(n.val).charAt(0) === '-' : n.t === 'v' ? !!n.neg : false; }
  look(n) {
    const night = this.isNeg(n);
    if (n.t === 's') return night ? { face: '#3B2C12', fg: '#FFE9B8', lip: '#7A5214' } : { face: '#FFF8E6', fg: '#16130C', lip: '#B7791F' };
    return night ? { face: '#182654', fg: '#DCE6FF', lip: '#0A1233' } : { face: '#F5F8FF', fg: '#16130C', lip: '#1E3A8A' };
  }
  elText(n) { return n.t === 'v' && n.neg ? '−' + n.el : n.el; }
  mkS(field, el, val) { return { id: this.nid('s'), t: 's', field: field, el: el, val: val }; }
  mkV(type, el, key, field, w) { return { id: this.nid('v'), t: 'v', type: type, el: el, key: key, field: field, w: w }; }
  mkProd(f, v) { return { id: this.nid('p'), t: 'prod', factors: f, vec: v }; }
  mkSum(terms) { return { id: this.nid('g'), t: 'sum', terms: terms }; }
  initialState() {
    const g = this.mkSum([{ node: this.mkS('R', '2', '2'), x: 0, y: 0 }, { node: this.mkS('R', '3', '3'), x: 146, y: 0 }]);
    const base = { flash: null, spawnCount: 0, holding: null, override: null, dragIds: null, panX: 0, panY: 0, zoom: 1 };
    if (!this.props.legacy) {
      // Rules mode only; the tray holds the two zeros (0 in ℝ, 0 in 𝑉), each an endless supply
      return Object.assign(base, {
        rules: true,
        tops: [
          { node: this.mkProd([g], this.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 24, y: 164 },
          { node: this.mkProd([this.mkS('R', '−1', '-1')], this.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 214, y: 352 }
        ],
        pieces: [
          { id: 'PZS', kind: 'zeroS', field: 'R', x: 30, y: 600, hx: 30, hy: 600 },
          { id: 'PZ', kind: 'zero', x: 150, y: 600, hx: 150, hy: 600 }
        ]
      });
    }
    // the original Sandbox board, with the full tray (kept for the tests of Sandbox moves)
    return {
      rules: false, flash: null, spawnCount: 0, holding: null, override: null, dragIds: null, panX: 0, panY: 0, zoom: 1,
      tops: [
        { node: this.mkProd([g], this.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 24, y: 164 },
        { node: this.mkProd([this.mkS('R', '−1', '-1')], this.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 214, y: 352 },
        { node: this.mkV('𝑊', '𝑤', 'w', null, 140), x: 76, y: 596 },
        { node: this.mkV('𝑈 ⊂ ℝ³', '(1, 2, 3)', 'u', 'R', 190), x: 300, y: 596 },
        { node: this.mkS('R', '2', '2'), x: 22, y: 716 },
        { node: this.mkS('R', '½', '½'), x: 132, y: 716 },
        { node: this.mkS('C', '𝑖', 'i'), x: 242, y: 716 },
        { node: this.mkS('R', '0', '0'), x: 352, y: 716 }
      ],
      pieces: [
        { id: 'P1', kind: 'strip', field: 'R', x: 22, y: 850, hx: 22, hy: 850 },
        { id: 'P2', kind: 'strip', field: 'C', x: 88, y: 850, hx: 88, hy: 850 },
        { id: 'PS', kind: 'paren', x: 150, y: 842, hx: 150, hy: 842 },
        { id: 'PZS', kind: 'zeroS', x: 306, y: 846, hx: 306, hy: 846 },
        { id: 'PZ', kind: 'zero', x: 410, y: 846, hx: 410, hy: 846 }
      ]
    };
  }
  componentDidMount() {
    this._rs = () => { if (this.board) { const r = this.board.getBoundingClientRect(); this.setState({ bw: r.width, bh: r.height }); } };
    this._rs();
    window.addEventListener('resize', this._rs);
    this.ptrs = new Map();
    this._mv = e => { if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.pinch) this.pinchMove(); else if (this.drag) this.move(e); else if (this.pdrag) this.pmove(e); else if (this.panning) this.panMove(e); };
    this._up = e => {
      if (e && this.ptrs.has(e.pointerId)) {
        this.ptrs.delete(e.pointerId);
        if (this.pinch && this.ptrs.size < 2) {
          this.pinch = null;
          const rest = Array.from(this.ptrs.values())[0];
          this.panning = rest ? { sx: rest.x, sy: rest.y, ox: this.state.panX, oy: this.state.panY } : null;
          return;
        }
        if (!this.ptrs.size) this.panning = null;
        if (!this.drag && !this.pdrag) return;
      }
      if (this.drag) this.end(); else if (this.pdrag) this.pend(); else if (this.panning) this.panning = null; else if (this.state.holding) this.setState({ holding: null });
    };
    window.addEventListener('pointermove', this._mv);
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
  }
  componentWillUnmount() {
    window.removeEventListener('resize', this._rs);
    window.removeEventListener('pointermove', this._mv);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
  }

  /* ---------- tree helpers ---------- */
  clone(x) { return JSON.parse(JSON.stringify(x)); }
  fieldSym(f) { return f === 'C' ? 'ℂ' : f === 'R' ? 'ℝ' : '𝐅'; }
  walk(n, fn, parent, rel) {
    fn(n, parent, rel);
    if (n.t === 'prod') { n.factors.forEach((f, i) => this.walk(f, fn, n, { kind: 'factor', idx: i })); if (n.vec) this.walk(n.vec, fn, n, { kind: 'vec' }); }
    else if (n.t === 'sum') n.terms.forEach((t, i) => this.walk(t.node, fn, n, { kind: 'term', idx: i }));
  }
  ids(n) { const out = []; this.walk(n, m => out.push(m.id), null, null); return out; }
  locate(tops, id) {
    for (let ti = 0; ti < tops.length; ti++) {
      if (tops[ti].node.id === id) return { kind: 'top', ti: ti, node: tops[ti].node };
      let found = null;
      this.walk(tops[ti].node, (n, parent, rel) => { if (!found && parent && n.id === id) found = { kind: rel.kind, idx: rel.idx, parent: parent, node: n, ti: ti }; }, null, null);
      if (found) return found;
    }
    return null;
  }
  setRef(tops, loc, node) {
    if (loc.kind === 'top') { if (node) tops[loc.ti].node = node; else tops.splice(loc.ti, 1); return; }
    const p = loc.parent;
    if (loc.kind === 'factor') { if (node) p.factors[loc.idx] = node; else p.factors.splice(loc.idx, 1); }
    else if (loc.kind === 'vec') p.vec = node;
    else if (loc.kind === 'term') { if (node) p.terms[loc.idx].node = node; else p.terms.splice(loc.idx, 1); }
  }
  slotXY(tops, loc) {
    if (loc.kind === 'top') return tops[loc.ti];
    if (loc.kind === 'term') return loc.parent.terms[loc.idx];
    return null;
  }
  normalize(n) {
    if (!n) return null;
    if (n.t === 'prod') {
      let fs = [];
      n.factors.forEach(f => { const g = this.normalize(f); if (!g) return; if (g.t === 'prod' && !g.vec) fs = fs.concat(g.factors); else fs.push(g); });
      n.factors = fs; n.vec = this.normalize(n.vec);
      if (!fs.length) return n.vec;
      if (fs.length === 1 && !n.vec) return fs[0];
      return n;
    }
    if (n.t === 'sum') {
      const out = []; let flat = false;
      n.terms.forEach(t => {
        const c = this.normalize(t.node); if (!c) return;
        if (c.t === 'sum') { flat = true; c.terms.forEach(it => out.push({ node: it.node, x: t.x + it.x, y: t.y + it.y })); }
        else out.push(Object.assign({}, t, { node: c }));
      });
      n.terms = out;
      if (flat) this.rowArrange(n);
      return n;
    }
    return n;
  }
  sumTypes(tops) {
    const m = {};
    tops.forEach(t => this.walk(t.node, n => { if (n.t === 'sum') m[n.id] = this.typeOf(n); }, null, null));
    return m;
  }
  typeWords(ty) {
    if (!ty || ty.k === 'e') return 'anything';
    if (ty.k === 's') return this.fieldSym(ty.f) + ' scalars';
    if (ty.k === 'v') return 'vectors in ' + ty.sp + (ty.f ? ' over ' + this.fieldSym(ty.f) : '');
    return 'mixed types';
  }
  brokenSum(before, after) {
    const a = this.sumTypes(after), b = this.sumTypes(before);
    const id = Object.keys(a).find(k => a[k].k === 'bad' && (!b[k] || b[k].k !== 'bad'));
    return id ? { id: id, was: b[id] } : null;
  }
  normTops(tops) {
    let out = tops.map(t => Object.assign({}, t, { node: this.normalize(t.node) })).filter(t => t.node);
    const inZone = t => { const m = this.measure(t.node); const cy = t.y + m.h / 2; return cy > this.K.ZT && cy < this.K.ZB; };
    if (out.filter(inZone).length > 1 || (this.state && this.state.rules)) {
      const res = [];
      out.forEach(t => {
        if (t.node.t === 'sum' && t.node.terms.length >= 2 && inZone(t)) {
          const m = this.measure(t.node); const bb = m.bb;
          const ox = t.x + m.padL + 26 + this.K.SPAD - bb.minX, oy = t.y + (m.h - bb.h) / 2 - bb.minY;
          t.node.terms.forEach(it => res.push({ node: it.node, x: ox + it.x, y: oy + it.y }));
        } else res.push(t);
      });
      out = res;
    }
    return out;
  }

  /* ---------- types and values ---------- */
  typeOf(n) {
    if (n.t === 's') return { k: 's', f: n.field };
    if (n.t === 'v') return { k: 'v', f: n.field, sp: n.type };
    if (n.t === 'prod') {
      let f = null;
      for (const x of n.factors) { const t = this.typeOf(x); if (t.k !== 's') return { k: 'bad' }; if (f && t.f !== f) return { k: 'bad' }; f = t.f; }
      if (n.vec) { const vt = this.typeOf(n.vec); if (vt.k !== 'v') return { k: 'bad' }; if (vt.f && f && vt.f !== f) return { k: 'bad' }; return { k: 'v', f: vt.f || f, sp: vt.sp }; }
      return f ? { k: 's', f: f } : { k: 'bad' };
    }
    if (n.t === 'sum') {
      if (!n.terms.length) return { k: 'e' };
      let acc = null;
      for (const t of n.terms) {
        const ty = this.typeOf(t.node);
        if (ty.k === 'bad' || ty.k === 'e') return { k: 'bad' };
        if (!acc) { acc = Object.assign({}, ty); continue; }
        if (ty.k !== acc.k) return { k: 'bad' };
        if (ty.k === 's' && ty.f !== acc.f) return { k: 'bad' };
        if (ty.k === 'v') { if (ty.sp !== acc.sp) return { k: 'bad' }; if (ty.f && acc.f && ty.f !== acc.f) return { k: 'bad' }; acc.f = acc.f || ty.f; }
      }
      return acc;
    }
    return { k: 'bad' };
  }
  cval(v) {
    const M = { '1': [1, 0], '-1': [-1, 0], '0': [0, 0], '2': [2, 0], '3': [3, 0], '√2': [Math.SQRT2, 0], '½': [0.5, 0], 'i': [0, 1], '1+i': [1, 1], '-i': [0, -1] };
    return M[v] || [1, 0];
  }
  mulC(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  addC(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  evalN(n) {
    if (n.t === 's') return { k: 's', c: this.cval(n.val) };
    if (n.t === 'v' && n.key === 'zero') return { k: 'v', coords: null, coef: {}, zero: true };
    if (n.t === 'v' && n.neg) return this.scaleV(this.evalN(Object.assign({}, n, { neg: false })), [-1, 0]);
    if (n.t === 'v') return n.key === 'u' ? { k: 'v', coords: [[1, 0], [2, 0], [3, 0]], coef: {} } : { k: 'v', coords: null, coef: { [n.el]: [1, 0] } };
    if (n.t === 'prod') {
      let c = [1, 0];
      for (const f of n.factors) { const e = this.evalN(f); if (!e || e.k !== 's') return null; c = this.mulC(c, e.c); }
      if (!n.vec) return { k: 's', c: c };
      const v = this.evalN(n.vec); if (!v || v.k !== 'v') return null;
      return this.scaleV(v, c);
    }
    if (n.t === 'sum') {
      let acc = null;
      for (const t of n.terms) { const e = this.evalN(t.node); if (!e) return null; acc = acc ? this.addE(acc, e) : e; if (!acc) return null; }
      return acc;
    }
    return null;
  }
  scaleV(v, c) {
    const coef = {}; Object.keys(v.coef).forEach(k => { coef[k] = this.mulC(v.coef[k], c); });
    return { k: 'v', coords: v.coords ? v.coords.map(x => this.mulC(x, c)) : null, coef: coef, zero: v.zero };
  }
  addE(a, b) {
    if (a.k !== b.k) return null;
    if (a.k === 's') return { k: 's', c: this.addC(a.c, b.c) };
    if (a.zero) return b;
    if (b.zero) return a;
    if (!!a.coords !== !!b.coords) return null;
    const coef = Object.assign({}, a.coef);
    Object.keys(b.coef).forEach(k => { coef[k] = coef[k] ? this.addC(coef[k], b.coef[k]) : b.coef[k]; });
    return { k: 'v', coords: a.coords ? a.coords.map((x, i) => this.addC(x, b.coords[i])) : null, coef: coef };
  }
  fmtR(x) {
    const near = a => Math.abs(a - Math.round(a)) < 1e-9;
    const neg = x < 0 ? '−' : ''; const a = Math.abs(x);
    if (a < 1e-9) return '0';
    if (near(a)) return neg + Math.round(a);
    if (near(a * 2)) { const n = Math.round(a * 2); return neg + (n === 1 ? '½' : n + '/2'); }
    if (near(a / Math.SQRT2)) { const k = Math.round(a / Math.SQRT2); return neg + (k === 1 ? '' : k) + '√2'; }
    return neg + a.toFixed(3);
  }
  fmtC(c) {
    const re = c[0], im = c[1];
    if (Math.abs(im) < 1e-9) return this.fmtR(re);
    const ip = Math.abs(Math.abs(im) - 1) < 1e-9 ? '𝑖' : this.fmtR(Math.abs(im)) + '𝑖';
    if (Math.abs(re) < 1e-9) return (im < 0 ? '−' : '') + ip;
    return this.fmtR(re) + (im < 0 ? ' − ' : ' + ') + ip;
  }
  fmtVal(e) {
    if (e.k === 's') return this.fmtC(e.c);
    if (e.coords) return '(' + e.coords.map(c => this.fmtC(c)).join(', ') + ')';
    const parts = [];
    Object.keys(e.coef).forEach(sym => {
      const c = e.coef[sym]; const s = this.fmtC(c);
      if (s === '0') return;
      if (s === '1') parts.push(sym); else if (s === '−1') parts.push('−' + sym);
      else if (s.indexOf(' ') >= 0) parts.push('(' + s + ')' + sym); else parts.push(s + sym);
    });
    if (!parts.length) return '0';
    return parts.map((p, i) => i === 0 ? p : (p.indexOf('−') === 0 ? ' − ' + p.slice(1) : ' + ' + p)).join('');
  }

  /* ---------- layout ---------- */
  ovFF(a, b) { const ga = a.t === 'sum', gb = b.t === 'sum'; return !ga && !gb ? 22 : (ga && gb ? 8 : 10); }
  ovFV(f, v) { const gf = f.t === 'sum'; return v.t === 'sum' ? (gf ? 8 : 16) : (gf ? 22 : 54); }
  sumPadL(n) { return this.typeOf(n).k === 'v' ? 0 : 8; }
  measure(n) {
    const K = this.K; let m;
    if (n.t === 's') m = { w: 96, h: 88 };
    else if (n.t === 'v') m = { w: n.w, h: 88 };
    else if (n.t === 'prod') {
      let x = 0, h = 88, end = 0; const rx = [];
      n.factors.forEach((f, i) => { const fm = this.measure(f); if (i > 0) x -= this.ovFF(n.factors[i - 1], f); rx.push(x); x += fm.w; h = Math.max(h, fm.h); end = x; });
      let vx = 0;
      if (n.vec) { const vm = this.measure(n.vec); vx = n.factors.length ? end - this.ovFV(n.factors[n.factors.length - 1], n.vec) : 0; end = vx + vm.w; h = Math.max(h, vm.h); }
      m = { w: end, h: h, rx: rx, vx: vx };
    } else {
      let bb;
      if (!n.terms.length) bb = { minX: 0, minY: 0, w: 120, h: 88 };
      else {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        n.terms.forEach(t => { const tm = this.measure(t.node); x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + tm.w); y1 = Math.max(y1, t.y + tm.h); });
        bb = { minX: x0, minY: y0, w: x1 - x0, h: y1 - y0 };
      }
      const h = Math.max(98, bb.h + 2 * K.SPAD);
      const padL = this.sumPadL(n);
      m = { w: padL + 26 + K.SPAD + bb.w + K.SPAD + 26 + 8, h: h, bb: bb, padL: padL };
    }
    this.M.set(n.id, m);
    return m;
  }
  bestPath(pts, boxes) {
    const n = pts.length; const idx = pts.map((_, i) => i);
    if (n < 3) return idx;
    const dist = boxes ? (a, b) => this.gapMid(boxes[a], boxes[b]).d + 0.001 * Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y)
      : (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
    if (n > 7) {
      let best = null;
      for (let s = 0; s < n; s++) {
        const used = new Set([s]); const path = [s]; let len = 0;
        while (path.length < n) { let bj = -1, bd = 1e12; for (let j = 0; j < n; j++) if (!used.has(j)) { const d = dist(path[path.length - 1], j); if (d < bd) { bd = d; bj = j; } } used.add(bj); path.push(bj); len += bd; }
        if (!best || len < best.len) best = { len: len, path: path };
      }
      return best.path;
    }
    let best = null;
    const perm = (arr, l) => {
      if (l === arr.length) {
        if (arr[0] > arr[arr.length - 1]) return;
        let len = 0; for (let i = 1; i < arr.length; i++) len += dist(arr[i - 1], arr[i]);
        if (!best || len < best.len - 1e-6) best = { len: len, path: arr.slice() };
        return;
      }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    perm(idx.slice(), 0);
    return best.path;
  }
  gapMid(a, b) {
    const ax = [a.x, a.x + a.w], bx = [b.x, b.x + b.w], ay = [a.y, a.y + a.h], by = [b.y, b.y + b.h];
    const mid = (p, q) => p[1] <= q[0] ? [(p[1] + q[0]) / 2, q[0] - p[1]] : q[1] <= p[0] ? [(q[1] + p[0]) / 2, p[0] - q[1]] : [(Math.max(p[0], q[0]) + Math.min(p[1], q[1])) / 2, 0];
    const mx = mid(ax, bx), my = mid(ay, by);
    return { x: mx[0], y: my[0], d: Math.hypot(mx[1], my[1]) };
  }
  plusesFor(items, z, gid, out) {
    const pts = items.map(p => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 }));
    const path = this.bestPath(pts, items);
    const on = new Set();
    for (let i = 1; i < path.length; i++) { const a = Math.min(path[i - 1], path[i]), b = Math.max(path[i - 1], path[i]); on.add(a + '-' + b); }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const lit = on.has(i + '-' + j);
      const gm = this.gapMid(items[i], items[j]);
      out.push({ x: gm.x - 19, y: gm.y - 19, z: z, op: lit ? 1 : 0, pe: lit ? 'auto' : 'none', tap: this.tapPlus(gid) });
    }
    return path;
  }
  layout(tops) {
    this.M = new Map(); this.P = new Map();
    const R = { hexes: [], vecs: [], groups: [], dots: [], pluses: [] };
    this._R = R;
    tops.forEach(t => { this.measure(t.node); this.place(t.node, t.x, t.y, 0, { z: 4 }); });
    const zoneItems = tops.filter(t => { const p = this.P.get(t.node.id); const cy = p.y + p.h / 2; return cy > this.K.ZT && cy < this.K.ZB; });
    this.zoneIds = zoneItems.map(t => t.node.id);
    this.zonePath = this.plusesFor(zoneItems.map(t => this.P.get(t.node.id)), 3, 'zone', R.pluses);
    return R;
  }
  place(n, x, y, depth, ctx) {
    const ov = this._ov;
    if (ov && ov.id === n.id) { x = ov.x; y = ov.y; }
    const m = this.M.get(n.id); const R = this._R; const K = this.K;
    const dragging = this._dset && this._dset.has(n.id);
    const z = (dragging ? 900 : 0) + (ctx.z != null ? ctx.z : depth * 20 + 4);
    this.P.set(n.id, { x: x, y: y, w: m.w, h: m.h, depth: depth });
    if (n.t === 's') {
      const sl = this.state.slide && this.state.slide.id === n.id ? this.state.slide : null;
      const lk = this.look(n);
      R.hexes.push({ x: x, y: y, dx: sl ? sl.x - x : 0, dy: sl ? sl.y - y : 0, face: lk.face, fg: lk.fg, lip: lk.lip, el: n.el, type: this.fieldSym(n.field), elSize: n.el.length > 3 ? 20 : 28,
        band: ctx.abstract ? 'repeating-linear-gradient(135deg, #F2B33D 0 6px, #DFA02A 6px 12px)' : '#F2B33D', sink: ctx.abstract ? 3 : 0,
        z: z, scale: dragging ? 1.04 : 1, shadow: dragging ? 14 : 7, anim: sl ? 'zeroIn 0.4s ease-out' : this._glow && this._glow.has(n.id) ? 'rgPulse 1.4s ease-in-out infinite' : 'none', down: this.onDown(n.id, 'self'), aria: 'Scalar ' + n.el + ' in ' + this.fieldSym(n.field) });
      return;
    }
    if (n.t === 'v') {
      const holding = this.state.holding === n.id;
      const sl = this.state.slide && this.state.slide.id === n.id ? this.state.slide : null;
      const lk = this.look(n); const et = this.elText(n);
      R.vecs.push({ x: x, y: y, w: n.w, type: n.type, el: et, elSize: et.length > 4 ? 21 : 27, face: lk.face, fg: lk.fg, lip: lk.lip,
        hasField: !!n.field, fLabel: this.fieldSym(n.field), pieceScale: holding ? 0.9 : 1, pieceBg: holding ? '#F7CD6E' : '#F2B33D',
        z: z, scale: dragging ? 1.04 : 1, shadow: dragging ? 14 : 7, down: this.onDown(n.id, 'self'), pieceDown: this.onDown(n.id, 'strip'),
        anim: sl ? 'zeroIn 0.4s ease-out' : this._glow && this._glow.has(n.id) ? 'rgPulse 1.4s ease-in-out infinite' : 'none', dx: sl ? sl.x - x : 0, dy: sl ? sl.y - y : 0,
        aria: 'Vector ' + et + ' in ' + n.type + (n.field ? ' over ' + this.fieldSym(n.field) : ', field not fixed') });
      return;
    }
    if (n.t === 'prod') {
      const cy = y + m.h / 2;
      const vt = n.vec ? this.typeOf(n.vec) : null;
      const abstract = !!(vt && vt.k === 'v' && !vt.f);
      const base = ctx.z != null ? ctx.z : depth * 20 + 4;
      n.factors.forEach((f, i) => {
        const fm = this.M.get(f.id);
        this.place(f, x + m.rx[i], cy - fm.h / 2, depth, { z: base + 2 + i, abstract: abstract });
        if (i < n.factors.length - 1) { const ov = this.ovFF(f, n.factors[i + 1]); R.dots.push({ x: x + m.rx[i] + fm.w - ov / 2 - 12, y: cy - 12, z: (dragging ? 900 : 0) + base + 2 + n.factors.length + 1 }); }
      });
      if (n.vec) { const vm = this.M.get(n.vec.id); this.place(n.vec, x + m.vx, cy - vm.h / 2, depth, { z: base, docked: n.factors.length > 0 }); }
      return;
    }
    // sum space
    const ty = this.typeOf(n);
    const bb = m.bb; const H = m.h; const padL = m.padL;
    const ox = x + padL + 26 + K.SPAD - bb.minX;
    const oy = y + (H - bb.h) / 2 - bb.minY;
    this.P.get(n.id).io = { ox: ox, oy: oy, ix: x + padL + 26, iy: y, iw: m.w - padL - 26 - 34, ih: H };
    const kind = ty.k === 's' ? 'f' : ty.k === 'v' ? 'v' : 'e';
    const lOut = 'M24 2 C-4 ' + H * 0.3 + ' -4 ' + H * 0.7 + ' 24 ' + (H - 2) + ' L26 ' + (H - 2) + ' L26 ' + (H - 14) + ' C8 ' + H * 0.68 + ' 8 ' + H * 0.32 + ' 26 14 Z';
    const lOutTip = 'M6 ' + (H / 2 - 20) + ' L-8 ' + (H / 2) + ' L6 ' + (H / 2 + 20) + ' Z';
    const lIn = 'M24 2 C4 ' + H * 0.18 + ' 1 ' + H * 0.3 + ' 2 ' + (H / 2 - 22) + ' L16 ' + (H / 2) + ' L2 ' + (H / 2 + 22) + ' C1 ' + H * 0.7 + ' 4 ' + H * 0.82 + ' 24 ' + (H - 2) + ' L26 ' + (H - 2) + ' L26 ' + (H - 14) + ' C18 ' + H * 0.7 + ' 20 ' + H * 0.3 + ' 26 14 Z';
    const rOut = 'M2 2 C30 ' + H * 0.3 + ' 30 ' + H * 0.7 + ' 2 ' + (H - 2) + ' L0 ' + (H - 2) + ' L0 ' + (H - 14) + ' C18 ' + H * 0.68 + ' 18 ' + H * 0.32 + ' 0 14 Z';
    const rOutTip = 'M20 ' + (H / 2 - 20) + ' L34 ' + (H / 2) + ' L20 ' + (H / 2 + 20) + ' Z';
    const rbx = m.w - 34;
    let g;
    if (kind === 'f') g = { col: '#F2B33D', lip: '#B7791F', lD: lOut, lTip: lOutTip, hasL: false,
      rLabel: this.fieldSym(ty.f), rTagBg: '#F2B33D', rTagFg: '#2A1D04', rTagLip: '#B7791F' };
    else if (kind === 'v') g = { col: '#4F7BE8', lip: '#1E3A8A', lD: lIn, lTip: '', hasL: true,
      lLabel: this.fieldSym(ty.f), lTagBg: ty.f ? '#F2B33D' : '#C38F2A', lTagFg: ty.f ? '#2A1D04' : '#5A420E',
      lTagShadow: ty.f ? '0 3px 0 #B7791F, 0 4px 8px rgba(0,0,0,0.35)' : 'inset 0 3px 6px rgba(60,38,0,0.6)', lOp: ctx.docked ? 0 : 1,
      rLabel: (ty.sp || '').split(' ')[0], rTagBg: '#2F5BD3', rTagFg: '#FFFFFF', rTagLip: '#1E3A8A' };
    else g = { col: ty.k === 'bad' ? '#F87171' : '#94A3B8', lip: '#475569', lD: lOut, lTip: lOutTip, hasL: false,
      rLabel: ty.k === 'bad' ? '!' : '?', rTagBg: '#94A3B8', rTagFg: '#1E293B', rTagLip: '#475569' };
    const gz = z;
    R.groups.push(Object.assign(g, { x: x, y: y, w: m.w, h: H, z: gz, lbx: padL, rbx: rbx, rD: rOut, rTip: rOutTip, rTagX: rbx + 14,
      bt: (H - 88) / 2, bgL: padL + 14, scale: dragging ? 1.02 : 1, anim: this._glow && this._glow.has(n.id) ? 'rgPulse 1.4s ease-in-out infinite' : 'none', down: this.onDown(n.id, 'bit'),
      aria: 'Sum space' + (kind === 'f' ? ' in ' + this.fieldSym(ty.f) : kind === 'v' ? ' in ' + ty.sp : '') + '. Drag a bracket to move it' }));
    n.terms.forEach(t => this.place(t.node, ox + t.x, oy + t.y, depth + 1, { z: (depth + 1) * 20 + 4 + (dragging ? 900 : 0) }));
    this.plusesFor(n.terms.map(t => this.P.get(t.node.id)), gz + 1, n.id, R.pluses);
  }

  /* ---------- interaction ---------- */
  unit() { const b = this.board; const r = b ? b.getBoundingClientRect() : null; return { u: r && r.width ? r.width / (this.state.bw || r.width) : 1, l: r ? r.left : 0, t: r ? r.top : 0 }; }
  fitScale() { return (this.state.bw || 390) / 560; }
  scaleNow(z) { return this.fitScale() * (z != null ? z : this.state.zoom); }
  panDown() {
    return e => {
      if (e && e.preventDefault) e.preventDefault();
      if (e.pointerId != null) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ptrs.size >= 2) {
        const [a, b] = Array.from(this.ptrs.values());
        const U = this.unit();
        this.panning = null;
        this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this.state.zoom,
          wx: ((a.x + b.x) / 2 - U.l) / (U.u * this.scaleNow()) - this.state.panX,
          wy: ((a.y + b.y) / 2 - U.t) / (U.u * this.scaleNow()) - this.state.panY };
        return;
      }
      this.panning = { sx: e.clientX, sy: e.clientY, ox: this.state.panX, oy: this.state.panY };
    };
  }
  pinchMove() {
    const pts = Array.from(this.ptrs.values()); if (pts.length < 2) return;
    const [a, b] = pts; const p = this.pinch; const U = this.unit();
    const z = Math.max(0.35, Math.min(2.2, p.z0 * Math.hypot(a.x - b.x, a.y - b.y) / p.d0));
    const S = U.u * this.scaleNow(z);
    this.setState({ zoom: z, panX: ((a.x + b.x) / 2 - U.l) / S - p.wx, panY: ((a.y + b.y) / 2 - U.t) / S - p.wy });
  }
  zoomAround(z) {
    z = Math.max(0.35, Math.min(2.2, z));
    const hw = (this.state.bw || 390) / 2, hh = (this.state.bh || 716) / 2;
    const cx = hw / this.scaleNow(), cy = hh / this.scaleNow();
    const wx = cx - this.state.panX, wy = cy - this.state.panY;
    this.setState({ zoom: z, panX: hw / this.scaleNow(z) - wx, panY: hh / this.scaleNow(z) - wy });
  }
  panMove(e) {
    const d = this.panning; const w = this.worldDelta(e, d);
    this.setState({ panX: Math.max(-3000, Math.min(400, d.ox + w.dx)), panY: Math.max(-2000, Math.min(400, d.oy + w.dy)) });
  }
  worldDelta(e, d) {
    const b = this.board; const r = b ? b.getBoundingClientRect() : null;
    const sc = (r && r.width ? r.width / this.K.WW : 390 / 560) * this.state.zoom;
    return { dx: (e.clientX - d.sx) / sc, dy: (e.clientY - d.sy) / sc };
  }
  onDown(id, role) {
    return e => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.begin(id, role, e);
    };
  }
  begin(id, role, e) {
    const tops = this.clone(this.state.tops);
    const loc = this.locate(tops, id); if (!loc) return;
    const abs = this.P.get(id) || { x: 0, y: 0, w: 96, h: 88 };
    const d = { id: id, role: role, sx: e.clientX, sy: e.clientY, moved: false, tops: tops, orig: this.clone(this.state.tops), rules: this.state.rules, gx: abs.x, gy: abs.y, gw: abs.w, gh: abs.h };
    // a 0 tile on its own (the tray's 0 in ℝ, or a vector 0 left over): over a matching term or bracket it adds + 0
    const zn = loc.node;
    if (loc.kind === 'top' && role === 'self' && ((zn.t === 's' && zn.val === '0') || (zn.t === 'v' && zn.key === 'zero'))) {
      const zt = this.typeOf(zn);
      d.zero = { kind: zt.k, f: zt.f, sp: zt.sp };
    }
    if (d.rules) {
      if (loc.kind === 'factor') { d.mode = loc.parent.vec ? 'reorder' : 'pending'; d.prodId = loc.parent.id; d.ax = abs.x; d.ay = abs.y; d.w = abs.w; }
      else { d.mode = 'move'; d.blockId = loc.kind === 'vec' ? loc.parent.id : id; this.prepMove(d); }
    } else {
      d.mode = 'sand'; d.blockId = loc.kind === 'vec' ? loc.parent.id : id;
      if (role === 'strip') {
        this.setState({ holding: id });
        clearTimeout(this._lp);
        this._lp = setTimeout(() => this.longPress(id), 550);
      }
    }
    this.drag = d;
  }
  prepMove(d) {
    const bl = this.locate(d.tops, d.blockId);
    const slot = this.slotXY(d.tops, bl);
    d.ox = slot.x; d.oy = slot.y;
  }
  detach(d) {
    const bl = this.locate(d.tops, d.blockId);
    if (bl.kind === 'top') { d.topKey = d.blockId; d.ox = d.tops[bl.ti].x; d.oy = d.tops[bl.ti].y; return; }
    const a = this.P.get(d.blockId);
    this.setRef(d.tops, bl, null);
    d.tops = this.normTops(d.tops);
    d.tops.push({ node: bl.node, x: a.x, y: a.y });
    d.topKey = bl.node.id; d.ox = a.x; d.oy = a.y;
  }
  dragSet(d) {
    const key = d.mode === 'reorder' ? d.id : (d.mode === 'sand' ? d.topKey : d.blockId);
    const loc = this.locate(d.tops, key);
    return loc ? this.ids(loc.node) : [];
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const w = this.worldDelta(e, d); const dx = w.dx, dy = w.dy;
    if (!d.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      d.moved = true; clearTimeout(this._lp);
      if (d.mode === 'pending') {
        if (Math.abs(dy) > Math.abs(dx)) { d.mode = 'move'; d.blockId = d.prodId; this.prepMove(d); } else d.mode = 'reorder';
      }
      if (d.mode === 'sand') this.detach(d);
      this.setState({ dragIds: this.dragSet(d), holding: null });
    }
    d.zeroHover = d.zero ? this.zeroTarget(d.gx + dx + d.gw / 2, d.gy + dy + d.gh / 2, d.zero.kind, Object.assign({ exclude: d.id }, d.zero)) : null;
    const pv = d.rules && !d.zeroHover ? this.findPreview(d, d.gx + dx + d.gw / 2, d.gy + dy + d.gh / 2) : null;
    d.preview = pv;
    if (d.mode === 'reorder' && pv) {
      this.setState({ override: { id: d.id, x: d.gx + dx, y: d.gy + dy }, preview: pv });
      return;
    }
    if (d.mode === 'reorder') {
      const loc = this.locate(d.tops, d.id); const prod = loc.parent;
      const cx = d.ax + dx + d.w / 2;
      let j = 0;
      prod.factors.forEach(f => { if (f.id === d.id) return; const p = this.P.get(f.id); if (p && p.x + p.w / 2 < cx) j++; });
      const me = prod.factors.splice(loc.idx, 1)[0]; prod.factors.splice(j, 0, me);
      let ox = d.ax + dx;
      if (prod.vec) { const vp = this.P.get(prod.vec.id); if (vp) ox = Math.min(ox, vp.x + 54 - d.w); }
      this.setState({ tops: this.clone(d.tops), override: { id: d.id, x: ox, y: d.ay }, preview: null });
      return;
    }
    const key = d.mode === 'sand' ? d.topKey : d.blockId;
    const bl = this.locate(d.tops, key); const slot = this.slotXY(d.tops, bl);
    if (slot) { slot.x = d.ox + dx; slot.y = d.oy + dy; }
    this.setState({ tops: this.clone(d.tops), preview: pv, zeroHover: d.zeroHover });
  }
  end() {
    clearTimeout(this._lp);
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (!d.moved) { this.setState({ holding: null, dragIds: null }); return; }
    if (this.state.zeroHover) this.setState({ zeroHover: null });
    if (d.zeroHover && this.dropZero(d)) return;
    if (d.rules && d.preview) { this.applyPreview(d); return; }
    if (d.mode === 'reorder') { this.setState({ override: null, dragIds: null, preview: null }); return; }
    if (d.mode === 'move') { this.setState({ dragIds: null, preview: null }); return; }
    this.dropSand(d);
  }
  sig(n) {
    if (n.t === 's') return 's:' + n.field + ':' + n.val;
    if (n.t === 'v') return 'v:' + n.type + ':' + (n.neg ? '-' : '') + n.el + ':' + n.field;
    if (n.t === 'prod') return 'p(' + n.factors.map(f => this.sig(f)).join('*') + '|' + (n.vec ? this.sig(n.vec) : '') + ')';
    return 'g(' + n.terms.map(t => this.sig(t.node)).sort().join('+') + ')';
  }
  factorsOf(n) { return n.t === 'prod' ? n.factors : (this.typeOf(n).k === 's' ? [n] : []); }
  vecOf(n) { return n.t === 'prod' ? n.vec : (this.typeOf(n).k === 'v' ? n : null); }
  cloneFresh(n) { const c = this.clone(n); this.walk(c, m => { m.id = this.nid(m.id.replace(/\d+$/, '')); }, null, null); return c; }
  matchSub(U, sub, fixedIds) {
    if (fixedIds) return fixedIds.slice();
    const fs = this.factorsOf(U); const used = new Set(); const ids = [];
    for (const s of sub) {
      const sg = this.sig(s);
      const f = fs.find(x => !used.has(x.id) && this.sig(x) === sg);
      if (!f) return null;
      used.add(f.id); ids.push(f.id);
    }
    return ids;
  }
  inRect(p, cx, cy, pad) { return p && cx > p.x - pad && cx < p.x + p.w + pad && cy > p.y - pad && cy < p.y + p.h + pad; }
  findPreview(d, cx, cy) {
    const orig = d.orig; const loc = this.locate(orig, d.id); if (!loc) return null;
    // pull a scalar bracket off the vector it is docked onto  →  (a + b)v = av + bv
    if (loc.kind === 'factor' && loc.node.t === 'sum') {
      const P = loc.parent;
      if (P.vec && loc.idx === P.factors.length - 1 && this.typeOf(loc.node).k === 's' && loc.node.terms.length) {
        const ddx = cx - (d.gx + d.gw / 2), ddy = cy - (d.gy + d.gh / 2);
        const far = Math.hypot(ddx, ddy) > 60;
        if (P.factors.length === 1 ? far : (far && Math.abs(ddy) > Math.abs(ddx))) return { type: 'expandV', pid: P.id, gid: loc.node.id };
      }
    }
    // expand: a factor sitting right next to a bracket, dragged inside it
    if (loc.kind === 'factor') {
      const P = loc.parent, i = loc.idx; const cands = [];
      const right = P.factors[i + 1]; const left = P.factors[i - 1];
      if (right && right.t === 'sum') cands.push(right);
      if (!right && P.vec && P.vec.t === 'sum') cands.push(P.vec);
      if (left && left.t === 'sum') cands.push(left);
      for (const G of cands) {
        const gp = this.P.get(G.id); const io = gp && gp.io;
        if (io && G.terms.length && cx > io.ix && cx < io.ix + io.iw && cy > io.iy && cy < io.iy + io.ih) return { type: 'expand', pid: P.id, gid: G.id };
      }
    }
    if (loc.node.t === 'v') return this.findVecPreview(orig, loc, cx, cy);
    // collect: the chain up to the grabbed piece, dropped on a matching piece in another term
    let T, sub, fixed;
    if (loc.kind === 'factor') { T = loc.parent; sub = T.factors.slice(0, loc.idx + 1); fixed = sub.map(x => x.id); }
    else if ((loc.kind === 'term' || loc.kind === 'top') && this.typeOf(loc.node).k === 's') { T = loc.node; sub = [T]; fixed = [T.id]; }
    else return null;
    const tl = this.locate(orig, T.id); let terms, cont;
    if (tl.kind === 'term') { terms = tl.parent.terms.map(t => t.node); cont = { type: 'sum', id: tl.parent.id }; }
    else if (tl.kind === 'top' && this.zoneIds.indexOf(T.id) >= 0) { terms = this.zoneIds.map(id => (orig.find(t => t.node.id === id) || {}).node).filter(Boolean); cont = { type: 'zone', ids: this.zoneIds.slice() }; }
    else return null;
    if (terms.length < 2) return null;
    const gsig = this.sig(loc.node); let hit = false;
    for (const U of terms) {
      if (U.id === T.id) continue;
      for (const f of this.factorsOf(U)) if (this.sig(f) === gsig && this.inRect(this.P.get(f.id), cx, cy, 6)) hit = true;
    }
    if (!hit) return null;
    const matches = {}; const glow = [];
    for (const U of terms) {
      const ids = this.matchSub(U, sub, U.id === T.id ? fixed : null);
      if (!ids) return null;
      matches[U.id] = ids; glow.push(...ids);
    }
    return { type: 'collect', cont: cont, tid: T.id, subIds: fixed, matches: matches, glow: glow };
  }
  termsOf(orig, T) {
    const tl = this.locate(orig, T.id);
    if (tl.kind === 'term') return { terms: tl.parent.terms.map(t => t.node), cont: { type: 'sum', id: tl.parent.id } };
    if (tl.kind === 'top' && this.zoneIds.indexOf(T.id) >= 0) return { terms: this.zoneIds.map(id => (orig.find(t => t.node.id === id) || {}).node).filter(Boolean), cont: { type: 'zone', ids: this.zoneIds.slice() } };
    return null;
  }
  findVecPreview(orig, loc, cx, cy) {
    const v = loc.node;
    // collect: v dropped on an equal vector in another term  →  av + bv = (a + b)v
    const T = loc.kind === 'vec' ? loc.parent : loc.node;
    const tc = this.termsOf(orig, T); if (!tc || tc.terms.length < 2) return null;
    const vs = this.sig(v); let hit = false; const glow = [];
    for (const U of tc.terms) {
      const uv = this.vecOf(U);
      if (!uv || uv.t !== 'v' || this.sig(uv) !== vs) return null;
      glow.push(uv.id);
      if (U.id !== T.id && this.inRect(this.P.get(uv.id), cx, cy, 6)) hit = true;
    }
    if (!hit) return null;
    return { type: 'collectV', cont: tc.cont, tid: T.id, vid: v.id, glow: glow };
  }
  rowArrange(S) {
    let cur = 0;
    S.terms.forEach(t => { const m = this.measure(t.node); t.x = cur; t.y = -m.h / 2; cur += m.w + 52; });
  }
  applyPreview(d) {
    const pv = d.preview; const tops = this.clone(d.orig);
    if (pv.type === 'expandV') {
      const loc = this.locate(tops, pv.pid); const P = loc.node;
      const G = P.factors[P.factors.length - 1]; const v = P.vec;
      G.terms.forEach(t => { t.node = this.normalize(this.mkProd(this.factorsOf(t.node).slice(), this.cloneFresh(v))); });
      this.rowArrange(G);
      P.factors = P.factors.slice(0, -1); P.vec = G;
      if (!P.factors.length) this.setRef(tops, loc, G);
      this.setState({ tops: this.normTops(tops), override: null, dragIds: null, preview: null });
      this.flash(this.P.get(pv.gid), 'Distributed the vector into every term', 'ok');
      return;
    }
    if (pv.type === 'collectV') {
      const v0 = this.cloneFresh(this.locate(tops, pv.vid).node);
      const coef = U => {
        const fs = U.t === 'prod' ? U.factors : [];
        const f = this.typeOf(U).f || 'R';
        return !fs.length ? this.mkS(f, '1', '1') : fs.length === 1 ? fs[0] : this.mkProd(fs, null);
      };
      if (pv.cont.type === 'sum') {
        const sl = this.locate(tops, pv.cont.id); const S = sl.node;
        const S2 = this.mkSum(S.terms.map(t => ({ node: coef(t.node), x: t.x, y: t.y })));
        this.rowArrange(S2);
        if (sl.kind === 'vec') { sl.parent.factors.push(S2); sl.parent.vec = v0; }
        else this.setRef(tops, sl, this.mkProd([S2], v0));
      } else {
        const zt = pv.cont.ids.map(id => tops.find(t => t.node.id === id)).filter(Boolean);
        const x0 = Math.min.apply(null, zt.map(t => t.x)), y0 = Math.min.apply(null, zt.map(t => t.y));
        const S2 = this.mkSum(zt.map(t => ({ node: coef(t.node), x: t.x - x0, y: t.y - y0 })));
        this.rowArrange(S2);
        zt.forEach(t => tops.splice(tops.indexOf(t), 1));
        tops.push({ node: this.mkProd([S2], v0), x: x0, y: y0 });
      }
      this.setState({ tops: this.normTops(tops), override: null, dragIds: null, preview: null });
      this.flash(this.P.get(pv.vid), 'Factored the vector out of every term', 'ok');
      return;
    }
    if (pv.type === 'expand') {
      const loc = this.locate(tops, pv.pid); const P = loc.node;
      const gi = P.factors.findIndex(f => f.id === pv.gid);
      let G, L, R;
      if (gi >= 0) { G = P.factors[gi]; L = P.factors.slice(0, gi); R = P.factors.slice(gi + 1); }
      else { G = P.vec; L = P.factors; R = []; }
      G.terms.forEach(t => {
        const fs = L.map(x => this.cloneFresh(x)).concat(this.factorsOf(t.node), R.map(x => this.cloneFresh(x)));
        t.node = this.normalize(this.mkProd(fs, this.vecOf(t.node)));
      });
      this.rowArrange(G);
      if (gi >= 0 && P.vec) P.factors = [G];
      else this.setRef(tops, loc, G);
      this.setState({ tops: this.normTops(tops), override: null, dragIds: null, preview: null });
      this.flash(this.P.get(pv.gid), 'Distributed into every term', 'ok');
      return;
    }
    // collect
    const T = this.locate(tops, pv.tid).node;
    const subSrc = pv.subIds.map(id => this.locate(tops, id).node);
    const field = this.typeOf(subSrc[0]).f;
    const sub = subSrc.map(x => this.cloneFresh(x));
    const reduce = (n, ids) => {
      const drop = new Set(ids);
      if (drop.has(n.id)) return this.mkS(field, '1', '1');
      if (n.t !== 'prod') return n;
      n.factors = n.factors.filter(f => !drop.has(f.id));
      const r = this.normalize(n);
      return r || this.mkS(field, '1', '1');
    };
    let kind;
    if (pv.cont.type === 'sum') {
      const sl = this.locate(tops, pv.cont.id); const S = sl.node;
      S.terms.forEach(t => { t.node = reduce(t.node, pv.matches[t.node.id] || []); });
      kind = this.typeOf(S).k;
      this.rowArrange(S);
      if (sl.kind === 'factor') sl.parent.factors.splice(sl.idx, 0, ...sub);
      else if (sl.kind === 'vec') sl.parent.factors.push(...sub);
      else this.setRef(tops, sl, kind === 'v' ? this.mkProd(sub, S) : this.mkProd(sub.concat([S]), null));
    } else {
      const zt = pv.cont.ids.map(id => tops.find(t => t.node.id === id)).filter(Boolean);
      const x0 = Math.min.apply(null, zt.map(t => t.x)), y0 = Math.min.apply(null, zt.map(t => t.y));
      const S = this.mkSum(zt.map(t => ({ node: reduce(t.node, pv.matches[t.node.id] || []), x: t.x - x0, y: t.y - y0 })));
      kind = this.typeOf(S).k;
      this.rowArrange(S);
      zt.forEach(t => tops.splice(tops.indexOf(t), 1));
      tops.push({ node: kind === 'v' ? this.mkProd(sub, S) : this.mkProd(sub.concat([S]), null), x: x0, y: y0 });
    }
    this.setState({ tops: this.normTops(tops), override: null, dragIds: null, preview: null });
    this.flash(this.P.get(pv.tid), 'Factored out of every term', 'ok');
  }
  dropSand(d) {
    let tops = d.tops;
    const ti = tops.findIndex(t => t.node.id === d.topKey); if (ti < 0) { this.setState({ dragIds: null }); return; }
    const D = tops[ti].node; const Dm = this.P.get(D.id);
    if (!Dm) { this.setState({ tops: this.normTops(tops), dragIds: null }); return; }
    const Dt = this.typeOf(D);
    let best = null;
    const cons = (dist, c) => { if (dist < (best ? best.dist : 42)) best = Object.assign({ dist: dist }, c); };
    tops.forEach((t, k) => {
      if (k === ti) return;
      this.walk(t.node, (n, parent, rel) => {
        const owner = !parent || rel.kind === 'term';
        if (n.t === 'sum') {
          const io = this.P.get(n.id) && this.P.get(n.id).io;
          const cx = Dm.x + Dm.w / 2, cy = Dm.y + Dm.h / 2;
          if (io && cx > io.ix - 10 && cx < io.ix + io.iw + 10 && cy > io.iy - 10 && cy < io.iy + io.ih + 10) {
            const St = this.typeOf(n);
            const ok = St.k === 'e' || (St.k === Dt.k && (Dt.k === 's' ? St.f === Dt.f : (St.sp === Dt.sp && (!St.f || !Dt.f || St.f === Dt.f))));
            cons(30 - (this.P.get(n.id).depth || 0), { type: 'term', S: n.id, ok: ok, io: io });
          }
        }
        if (owner) this.rowDocks(n, D, Dm, Dt, cons);
      }, null, null);
    });
    if (!best) { this.setState({ tops: this.normTops(tops), dragIds: null }); return; }
    if (!best.ok) {
      this.setState({ tops: d.orig, dragIds: null });
      if (best.type === 'term') {
        const S = this.locate(tops, best.S).node;
        this.flash(Dm, 'This sum only takes ' + this.typeWords(this.typeOf(S)), 'bad');
      } else this.flash(Dm, 'Won’t fit: the fields don’t match', 'bad');
      return;
    }
    tops.splice(ti, 1);
    const loc = this.locate(tops, best.type === 'term' ? best.S : best.R);
    if (best.type === 'term') {
      loc.node.terms.push({ node: D, x: Dm.x - best.io.ox, y: Dm.y - best.io.oy });
    } else {
      const Rn = loc.node; const slot = this.slotXY(tops, loc);
      if (best.type === 'factor') {
        const Df = D.t === 'prod' && !D.vec ? D.factors : [D];
        const Rt = this.typeOf(Rn);
        if (Rn.t === 'prod') Rn.factors.splice(best.k, 0, ...Df);
        else if (Rt.k === 's') this.setRef(tops, loc, this.mkProd(best.k === 0 ? Df.concat([Rn]) : [Rn].concat(Df), null));
        else this.setRef(tops, loc, this.mkProd(Df, Rn));
        if (best.k === 0 && slot) slot.x += best.shift;
      } else {
        if (Rn.t === 'prod') Rn.vec = D; else this.setRef(tops, loc, this.mkProd([Rn], D));
      }
    }
    const after = this.normTops(tops);
    const broke = this.brokenSum(d.orig, after);
    if (broke) {
      this.setState({ tops: d.orig, dragIds: null });
      this.flash(Dm, 'That would change a term’s type · this sum only takes ' + this.typeWords(broke.was), 'bad');
      return;
    }
    this.setState({ tops: after, dragIds: null });
  }
  rowDocks(R, D, Dm, Dt, cons) {
    const Rt = this.typeOf(R); if (Rt.k === 'bad' || Rt.k === 'e') return;
    const F = R.t === 'prod' ? R.factors : (Rt.k === 's' ? [R] : []);
    const V = R.t === 'prod' ? R.vec : (Rt.k === 'v' ? R : null);
    const rp = this.P.get(R.id); if (!rp) return;
    const ty = rp.y + rp.h / 2 - Dm.h / 2;
    const fieldOk = !Rt.f || !Dt.f || Rt.f === Dt.f;
    if (Dt.k === 's') {
      for (let k = 0; k <= F.length; k++) {
        let tx, shift = 0;
        if (k < F.length) { const ov = this.ovFF(D, F[k]); tx = this.P.get(F[k].id).x - Dm.w + ov; if (k === 0) shift = -(Dm.w - ov); }
        else if (V) { const ov = this.ovFV(D, V); tx = this.P.get(V.id).x + ov - Dm.w; if (k === 0) shift = -(Dm.w - ov); }
        else if (F.length) { const lf = F[F.length - 1]; const lp = this.P.get(lf.id); tx = lp.x + lp.w - this.ovFF(lf, D); }
        else continue;
        cons(Math.hypot(Dm.x - tx, Dm.y - ty), { type: 'factor', R: R.id, k: k, ok: fieldOk, shift: shift });
      }
    } else if (Dt.k === 'v' && D.t !== 'prod' && !V && F.length) {
      const lf = F[F.length - 1]; const lp = this.P.get(lf.id); const tx = lp.x + lp.w - this.ovFV(lf, D);
      cons(Math.hypot(Dm.x - tx, Dm.y - ty), { type: 'vec', R: R.id, ok: fieldOk });
    }
  }
  longPress(id) {
    const d = this.drag;
    if (!d || d.moved || d.id !== id || this.state.rules) return;
    this.drag = null;
    const tops = this.clone(this.state.tops); const loc = this.locate(tops, id);
    const f = loc.node.field; loc.node.field = null;
    this.setState({ tops: tops, holding: null, dragIds: null });
    this.flash(this.P.get(id), 'Removed ' + this.fieldSym(f) + ' · ' + loc.node.type + ' is back to an abstract 𝐅', 'info');
  }
  pieceDown(pc) {
    return e => {
      if (e && e.preventDefault) e.preventDefault();
      if (this.state.rules && pc.kind !== 'zero' && pc.kind !== 'zeroS') return;
      this.pdrag = { id: pc.id, sx: e.clientX, sy: e.clientY, ox: pc.x, oy: pc.y, moved: false };
    };
  }
  pmove(e) {
    const d = this.pdrag; const w = this.worldDelta(e, d);
    if (!d.moved && Math.abs(w.dx) + Math.abs(w.dy) < 8) return;
    d.moved = true;
    const up = { pieces: this.state.pieces.map(p => p.id === d.id ? Object.assign({}, p, { x: d.ox + w.dx, y: d.oy + w.dy }) : p) };
    if (d.id === 'PZ') up.zeroHover = this.zeroTarget(d.ox + w.dx + this.K.ZW / 2, d.oy + w.dy + 44, 'v');
    if (d.id === 'PZS') up.zeroHover = this.zeroTarget(d.ox + w.dx + 48, d.oy + w.dy + 44, 's', { f: this.state.pieces.find(p => p.id === 'PZS').field });
    this.setState(up);
  }
  // What a dragged 0 is over: a tile of its kind ('v' vectors, 's' scalars), or the right bracket of a sum of that
  // kind (the deepest one, tiles first)
  // opts (a 0 tile being dragged): exclude its own id; f / sp: its field and space, which the target must match
  zeroTarget(cx, cy, kind, opts) {
    opts = opts || {};
    let best = null;
    const take = (n, depth, prio) => { if (!best || depth > best.depth || (depth === best.depth && prio > best.prio)) best = { id: n.id, depth: depth, prio: prio }; };
    this.state.tops.forEach(t => this.walk(t.node, n => {
      const p = this.P.get(n.id); if (!p || n.id === opts.exclude) return;
      if (n.t === (kind === 'v' ? 'v' : 's') && this.inRect(p, cx, cy, 6)) take(n, p.depth, 1);
      else if (n.t === 'sum' && this.typeOf(n).k === kind) {
        const rb = { x: p.x + p.w - 34 - 10, y: p.y, w: 44, h: p.h };
        if (this.inRect(rb, cx, cy, 6)) take(n, p.depth, 0);
      }
    }, null, null));
    if (!best) return null;
    // a tile inside a product means the whole term: a docked vector is its a·v, a factor of a scalar product is the
    // product, so the 0 lands after the term (a·v + 0), not inside it (a·(v + 0))
    const loc = this.locate(this.state.tops, best.id);
    const n = loc.kind === 'vec' || (loc.kind === 'factor' && !loc.parent.vec) ? loc.parent : loc.node;
    const ty = this.typeOf(n);
    if (opts.f && ty.f && ty.f !== opts.f) return null;
    if (opts.sp && ty.sp !== opts.sp) return null;
    return { id: n.id, sp: ty.sp, f: ty.f, kind: n.t, glow: this.ids(n) };
  }
  // a 0 tile released over a target: it leaves its spot and joins the target's sum
  dropZero(d) {
    const tops = this.clone(d.tops);
    const ti = tops.findIndex(t => t.node.id === d.id); if (ti < 0) return false;
    const from = tops[ti]; tops.splice(ti, 1);
    const tgt = this.locate(tops, d.zeroHover.id); if (!tgt) return false;
    const at = this.P.get(d.zeroHover.id);
    const z = this.addZero(tops, d.zeroHover.id, from.node); if (!z) return false;
    this.setState({ tops: this.normTops(tops), dragIds: null, preview: null, override: null, slide: { id: z.id, x: from.x, y: from.y } });
    clearTimeout(this._st);
    this._st = setTimeout(() => this.setState({ slide: null }), 450);
    const name = this.label(tgt.node);
    this.flash(at, name + ' = ' + name + ' + 0 · additive identity', 'ok');
    return true;
  }
  // The expression as plain text, written straight from the tree: terms in reading order (left to right, then top
  // to bottom), joined by +; sums in brackets; scalars multiplied with ·; a vector written right after its scalars.
  // top: the expression zone's terms, which are a sum without brackets.
  exprText(nodes, top) {
    const pos = n => this.P.get(n.id) || { x: 0, y: 0 };
    const order = ns => ns.slice().sort((a, b) => Math.abs(pos(a).y - pos(b).y) > 60 ? pos(a).y - pos(b).y : pos(a).x - pos(b).x);
    const one = n => {
      if (n.t === 's' || n.t === 'v') return this.elText(n);
      if (n.t === 'sum') return '(' + order(n.terms.map(t => t.node)).map(one).join(' + ') + ')';
      const fs = n.factors.map(one).join('·');
      return n.vec ? fs + one(n.vec) : fs;
    };
    const parts = order(nodes).map(one);
    return top ? parts.join(' + ') : '(' + parts.join(' + ') + ')';
  }
  // a short text form of a term, for messages: −1·𝑣, (2 + 3)·𝑣
  label(n) {
    if (n.t === 's' || n.t === 'v') return this.elText(n);
    if (n.t === 'prod') return n.factors.map(f => this.label(f)).concat(n.vec ? [this.label(n.vec)] : []).join('·');
    return '(' + n.terms.map(t => this.label(t.node)).join(' + ') + ')';
  }
  // v  ->  v + 0 (Axler 1.20, additive identity, read right to left), and a  ->  a + 0 for scalars (the field's). The 0 lands just right of its target, in the
  // same sum: after a term, at the right end of a bracket, or in a new bracket (v + 0) for a vector on its own or
  // docked after scalars. Returns the new 0, or null.
  addZero(tops, id, given) {
    const loc = this.locate(tops, id); if (!loc) return null;
    const X = loc.node; const ty = this.typeOf(X);
    if (ty.k !== 'v' && ty.k !== 's') return null;
    const K = this.K;
    const z = given || (ty.k === 'v' ? this.mkV(ty.sp, '0', 'zero', ty.f || null, K.ZW) : this.mkS(ty.f, '0', '0'));
    const zw = this.measure(z).w;
    if (X.t === 'sum') {
      let x1 = -K.GAP, y0 = -44, y1 = 44;
      if (X.terms.length) { x1 = -1e9; y0 = 1e9; y1 = -1e9; }
      X.terms.forEach(t => { const m = this.measure(t.node); x1 = Math.max(x1, t.x + m.w); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y + m.h); });
      X.terms.push({ node: z, x: x1 + K.GAP, y: (y0 + y1) / 2 - 44 });
      return z;
    }
    const m = this.measure(X);
    const beside = (list, t, inSame) => {
      list.forEach(u => { if (u !== t && inSame(u) && u.x >= t.x + m.w - 1) u.x += zw + K.GAP; });
      list.splice(list.indexOf(t) + 1, 0, { node: z, x: t.x + m.w + K.GAP, y: t.y + m.h / 2 - 44 });
    };
    if (loc.kind === 'term') { beside(loc.parent.terms, loc.parent.terms[loc.idx], () => true); return z; }
    if (loc.kind === 'top' && this.zoneIds.indexOf(X.id) >= 0) { beside(tops, tops[loc.ti], u => this.zoneIds.indexOf(u.node.id) >= 0); return z; }
    const S = this.mkSum([{ node: X, x: 0, y: 0 }, { node: z, x: m.w + K.GAP, y: m.h / 2 - 44 }]);
    if (loc.kind === 'top') {
      const t = tops[loc.ti];
      t.x -= this.sumPadL(S) + 26 + K.SPAD; // keep the vector where it was
      // whatever sits to its right in the same row moves aside for the 0 and the closing bracket
      tops.forEach(u => {
        if (u === t) return;
        const um = this.measure(u.node);
        if (u.y < t.y + m.h && u.y + um.h > t.y && u.x >= t.x + m.w) u.x += zw + K.GAP + K.SPAD + 34;
      });
    }
    this.setRef(tops, loc, S);
    return z;
  }
  pend() {
    const d = this.pdrag; this.pdrag = null;
    const pc = this.state.pieces.find(p => p.id === d.id);
    const home = this.state.pieces.map(p => p.id === d.id ? Object.assign({}, p, { x: p.hx, y: p.hy }) : p);
    let tops = this.clone(this.state.tops);
    if (pc.kind === 'zero' || pc.kind === 'zeroS') {
      const hit = d.moved ? this.state.zeroHover : null;
      this.setState({ pieces: home, zeroHover: null });
      if (!d.moved) { this.flash({ x: pc.hx, y: pc.hy }, pc.kind === 'zero' ? 'Drag the 0 onto a vector, or a vector sum’s right bracket' : 'Drag the 0 onto a scalar, or a scalar sum’s right bracket', 'info'); return; }
      if (!hit) return;
      const at = this.P.get(hit.id); const tgt = this.locate(tops, hit.id).node;
      const z = this.addZero(tops, hit.id); if (!z) return;
      this.setState({ tops: this.normTops(tops), slide: { id: z.id, x: pc.x, y: pc.y } });
      clearTimeout(this._st);
      this._st = setTimeout(() => this.setState({ slide: null }), 450);
      const name = tgt.t === 'v' || tgt.t === 's' ? tgt.el : tgt.t === 'prod' ? this.label(tgt) : 'the sum';
      this.flash(at, name + ' = ' + name + ' + 0 · additive identity', 'ok');
      return;
    }
    if (!d.moved) {
      if (pc.kind === 'strip') {
        const lists = { R: [['2', '2'], ['√2', '√2'], ['½', '½'], ['3', '3'], ['−1', '-1']], C: [['1 + 𝑖', '1+i'], ['−𝑖', '-i'], ['𝑖', 'i']] };
        const n = this.state.spawnCount; const L = lists[pc.field]; const pick = L[n % L.length];
        tops.push({ node: this.mkS(pc.field, pick[0], pick[1]), x: 452, y: 716 - (n % 4) * 12 });
        this.setState({ tops: tops, pieces: home, spawnCount: n + 1 });
      } else {
        this.setState({ pieces: home });
        this.flash({ x: pc.hx, y: pc.hy }, 'Drag the brackets out to make a sum space', 'info');
      }
      return;
    }
    if (pc.kind === 'paren') {
      tops.push({ node: this.mkSum([]), x: pc.x - 60, y: pc.y - 20 });
      this.setState({ tops: tops, pieces: home });
      return;
    }
    let target = null, bd = 44;
    tops.forEach(t => this.walk(t.node, n => {
      if (n.t !== 'v') return; const p = this.P.get(n.id); if (!p) return;
      const dist = Math.hypot(pc.x + 5 - p.x, pc.y + 9 - p.y); if (dist < bd) { bd = dist; target = n; }
    }, null, null));
    this.setState({ pieces: home });
    if (!target) return;
    const loc = this.locate(tops, target.id); const v = loc.node; const at = this.P.get(v.id);
    if (v.field) { this.flash(at, v.field === pc.field ? v.type + ' is already over ' + this.fieldSym(pc.field) : v.type + ' is over ' + this.fieldSym(v.field) + ' · hold its strip to remove it', v.field === pc.field ? 'info' : 'bad'); return; }
    if (loc.kind === 'vec') { const pt = this.typeOf(this.mkProd(loc.parent.factors, null)); if (pt.f && pt.f !== pc.field) { this.flash(at, 'Its scalars are in ' + this.fieldSym(pt.f), 'bad'); return; } }
    v.field = pc.field;
    const broke = this.brokenSum(this.state.tops, tops);
    if (broke) { this.flash(at, 'That sum only takes ' + this.typeWords(broke.was), 'bad'); return; }
    this.setState({ tops: tops });
    this.flash(at, 'Defined 𝐅 = ' + this.fieldSym(pc.field) + ' for ' + v.type, 'ok');
  }
  tapPlus(gid) {
    return () => {
      const now = Date.now();
      if (this._lastTap && this._lastTap.g === gid && now - this._lastTap.t < 400) { this._lastTap = null; this.arrange(gid); }
      else this._lastTap = { g: gid, t: now };
    };
  }
  arrange(gid) {
    const tops = this.clone(this.state.tops);
    if (gid === 'zone') {
      const items = this.zoneIds.map(id => tops.find(t => t.node.id === id)).filter(Boolean);
      const order = this.zonePath.map(i => items[i]);
      let cur = 30; const cy = 326;
      order.forEach(t => { const p = this.P.get(t.node.id); t.x = cur; t.y = cy - p.h / 2; cur += p.w + 52; });
    } else {
      const loc = this.locate(tops, gid); if (!loc) return;
      const S = loc.node;
      const bx = S.terms.map(t => this.P.get(t.node.id));
      const path = this.bestPath(bx.map(p => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })), bx);
      let cur = 0;
      path.forEach(i => { const t = S.terms[i]; const p = this.P.get(t.node.id); t.x = cur; t.y = -p.h / 2; cur += p.w + 52; });
    }
    this.setState({ tops: tops });
  }
  flash(at, text, kind) {
    const f = { x: Math.max(12, Math.min((at && at.x || 40) - 40, 200)), y: Math.max(120, (at && at.y || 200) - 50), text: text, kind: kind };
    this.setState({ flash: f });
    clearTimeout(this._ft);
    this._ft = setTimeout(() => this.setState({ flash: null }), 2000);
  }

  /* ---------- render ---------- */
  renderVals() {
    const St = this.state;
    this._ov = St.override;
    this._dset = new Set(St.dragIds || []);
    this._glow = St.preview && (St.preview.type === 'collect' || St.preview.type === 'collectV') ? new Set(St.preview.glow) : null;
    if (St.zeroHover) this._glow = new Set(St.zeroHover.glow || [St.zeroHover.id]);
    const R = this.layout(St.tops);
    const zb = { l: 10, r: 550 };
    this.zoneIds.forEach(id => { const p = this.P.get(id); if (p) { zb.l = Math.min(zb.l, p.x - 24); zb.r = Math.max(zb.r, p.x + p.w + 24); } });
    const results = [];
    const zoneTops = St.tops.filter(t => this.zoneIds.indexOf(t.node.id) >= 0 && !this._dset.has(t.node.id));
    if (zoneTops.length) {
      const types = zoneTops.map(t => this.typeOf(t.node));
      let ok = types.every(t => t.k === 's' || t.k === 'v');
      ok = ok && types.every(t => t.k === types[0].k && (t.k === 's' ? t.f === types[0].f : t.sp === types[0].sp));
      let val = null;
      if (ok) { for (const t of zoneTops) { const e = this.evalN(t.node); if (!e) { val = null; break; } val = val ? this.addE(val, e) : e; if (!val) break; } }
      const red = { bg: 'rgba(248,113,113,0.16)', border: '#F87171', fg: '#FEE2E2' };
      const green = { bg: 'rgba(52,211,153,0.16)', border: '#34D399', fg: '#D1FAE5' };
      this.zoneValue = ok && val ? '= ' + this.fmtVal(val) : null; // the old readout, still used by the tests
      const text = this.exprText(zoneTops.map(t => t.node), true);
      if (ok && val) results.push(Object.assign({ x: 24, y: 470, main: text, note: '' }, green));
      else results.push(Object.assign({ x: 24, y: 470, main: text, note: 'terms in the expression need the same type' }, red));
    }
    const ghosts = [];
    const HEXC = 'polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%)';
    if (St.preview && St.preview.type === 'expandV' && this.drag) {
      const o = this.locate(this.drag.orig, St.preview.pid);
      const v = o && o.node.vec; const G = o && o.node.factors[o.node.factors.length - 1];
      if (v && G) G.terms.forEach(t => {
        const tp = this.P.get(t.node.id); if (!tp) return;
        ghosts.push({ x: tp.x + tp.w - 22, y: tp.y + tp.h / 2 - 44, type: v.type.split(' ')[0], el: this.elText(v), elSize: v.el.length > 4 ? 20 : 27,
          clip: 'polygon(0 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 0 100%, 22px 50%)', face: this.look(v).face, fg: this.look(v).fg, band: '#2F5BD3', bandFg: '#FFFFFF' });
      });
    }
    if (St.preview && St.preview.type === 'expand' && this.drag) {
      const o = this.locate(this.drag.orig, St.preview.pid);
      if (o) {
        const P = o.node; const gi = P.factors.findIndex(f => f.id === St.preview.gid);
        const lft = gi >= 0 ? P.factors[gi - 1] : P.factors[P.factors.length - 1];
        const rgt = gi >= 0 ? P.factors[gi + 1] : null;
        const G = gi >= 0 ? P.factors[gi] : P.vec;
        const gh = n => ({ type: n.t === 's' ? this.fieldSym(n.field) : '( )', el: n.t === 's' ? n.el : '…', elSize: n.t === 's' && n.el.length > 3 ? 20 : 28, clip: HEXC, face: n.t === 's' ? this.look(n).face : '#FFF8E6', fg: n.t === 's' ? this.look(n).fg : '#16130C', band: '#F2B33D', bandFg: '#2A1D04' });
        G.terms.forEach(t => {
          const tp = this.P.get(t.node.id); if (!tp) return;
          const cy = tp.y + tp.h / 2 - 44;
          if (lft) ghosts.push(Object.assign({ x: tp.x - 96 + 22, y: cy }, gh(lft)));
          if (rgt) ghosts.push(Object.assign({ x: tp.x + tp.w - 22, y: cy }, gh(rgt)));
        });
      }
    }
    const fc = { ok: ['rgba(52,211,153,0.94)', '#34D399', '#052E1C'], info: ['rgba(148,163,184,0.94)', '#CBD5E1', '#0F172A'], bad: ['rgba(248,113,113,0.96)', '#F87171', '#3B0707'] };
    const F = St.flash;
    const flashes = F ? [{ x: F.x, y: F.y, text: F.text, bg: fc[F.kind][0], border: fc[F.kind][1], fg: fc[F.kind][2] }] : [];
    const rules = St.rules;
    const strips = St.pieces.filter(p => p.kind === 'strip').map(p => ({ x: p.x, y: p.y, label: this.fieldSym(p.field), z: this.pdrag && this.pdrag.id === p.id ? 990 : 5,
      op: rules ? 0.3 : 1, pe: rules ? 'none' : 'auto', down: this.pieceDown(p), aria: 'Field ' + this.fieldSym(p.field) + ': slot onto a vector’s 𝐅, or tap for a scalar' }));
    const ps = St.pieces.find(p => p.kind === 'paren');
    const zp = St.pieces.find(p => p.kind === 'zero'); const zDrag = !!(this.pdrag && this.pdrag.id === zp.id);
    const zeroTile = { x: zp.x, y: zp.y, w: this.K.ZW, type: zDrag && St.zeroHover ? (St.zeroHover.sp || '𝑉').split(' ')[0] : '𝑉', el: '0', elSize: 27, face: '#F5F8FF', fg: '#16130C', lip: '#1E3A8A',
      hasField: false, z: zDrag ? 990 : 6, scale: zDrag ? 1.04 : 1, shadow: zDrag ? 14 : 7, anim: 'none', dx: 0, dy: 0, down: this.pieceDown(zp),
      aria: 'The zero vector: drag it onto a vector, or onto a vector sum’s right bracket, to add + 0' };
    const zs = St.pieces.find(p => p.kind === 'zeroS'); const zsDrag = !!(this.pdrag && this.pdrag.id === zs.id);
    const zsHover = zsDrag && St.zeroHover;
    const zeroHex = { x: zs.x, y: zs.y, dx: 0, dy: 0, el: '0', elSize: 28, face: '#FFF8E6', fg: '#16130C', lip: '#B7791F', type: zs.field ? this.fieldSym(zs.field) : zsHover && zsHover.f ? this.fieldSym(zsHover.f) : '𝐅', band: '#F2B33D', sink: 0,
      z: zsDrag ? 990 : 6, scale: zsDrag ? 1.04 : 1, shadow: zsDrag ? 14 : 7, anim: 'none', down: this.pieceDown(zs),
      aria: 'The scalar zero: drag it onto a scalar, or onto a scalar sum’s right bracket, to add + 0' };
    return {
      setBoard: this.setBoard, panDown: this.panDown(), panX: St.panX, panY: St.panY, worldScale: this.scaleNow(),
      baseScale: this.fitScale(), overlayH: (St.bh || 716) / this.fitScale(),
      zoomIn: () => this.zoomAround(this.state.zoom * 1.25), zoomOut: () => this.zoomAround(this.state.zoom / 1.25),
      zoomReset: () => this.setState({ zoom: 1, panX: 0, panY: 0 }), showReset: Math.abs(St.zoom - 1) > 0.01 || St.panX !== 0 || St.panY !== 0, zoomPct: Math.round(St.zoom * 100),
      zoneL: zb.l, zoneW: zb.r - zb.l,
      ghosts: ghosts, groups: R.groups, pluses: R.pluses, vecs: R.vecs.concat([zeroTile]), hexes: R.hexes.concat([zeroHex]), dots: R.dots, strips: strips,
      parenSrc: ps ? { x: ps.x, y: ps.y, z: this.pdrag && this.pdrag.id === ps.id ? 990 : 5, op: rules ? 0.3 : 1, pe: rules ? 'none' : 'auto', down: this.pieceDown(ps) } : null,
      legacy: !!this.props.legacy, trayH: this.props.legacy ? 414 : 190,
      results: results, flashes: flashes,
      toggleRules: () => this.setState({ rules: !this.state.rules }),
      rulesStr: rules ? 'true' : 'false',
      ruleBg: rules ? '#F2B33D' : 'rgba(255,255,255,0.08)', ruleFg: rules ? '#2A1D04' : '#E2E8F0',
      ruleBorder: rules ? '#B7791F' : 'rgba(203,213,225,0.5)',
      ruleShadow: rules ? 'inset 0 4px 8px rgba(80,50,0,0.55)' : '0 5px 0 rgba(0,0,0,0.35)', ruleShift: rules ? 4 : 0,
      trayOp: rules ? 0.5 : 1,
      modeName: rules ? 'RULES' : 'SANDBOX',
      modeLine: rules ? 'Only moves the axioms allow: reorder products, rearrange sums.' : 'Build freely: dock, undock and nest anything.',
      hint: rules ? 'Drag sideways to reorder · drag a scalar into the brackets beside it, or pull brackets off a vector, to distribute · drop a scalar or vector on a match to factor it out · drag a 0 onto a term to add + 0'
        : 'Scalars dock tip to tip or onto a vector’s edge · drop things inside ( + ) to add them · double-tap a + to tidy'
    };
  }

  render() {
    const v = this.renderVals();
    return html`
<div ref=${v.setBoard} style="width: 100%; height: 100%; position: relative; overflow: hidden; background-color: #121A2B; color: #F8FAFC; font-family: 'STIX Two Text', 'Cambria Math', 'Times New Roman', serif; user-select: none; -webkit-user-select: none">
  <div style=${`position: absolute; left: 0; top: 0; width: 560px; height: 1028px; transform: scale(${v.worldScale}) translate(${v.panX}px, ${v.panY}px); transform-origin: 0 0`}>
    <div onPointerDown=${v.panDown} aria-hidden="true" style="position: absolute; left: -4020px; top: -4020px; width: 9000px; height: 9000px; touch-action: none; cursor: grab; background-image: radial-gradient(rgba(148,163,184,0.22) 1.4px, transparent 2px); background-size: 30px 30px"></div>


    <div style=${`position: absolute; left: ${v.zoneL}px; top: 126px; width: ${v.zoneW}px; height: 400px; box-sizing: border-box; border-radius: 24px; border: 2px dashed rgba(148,163,184,0.28); pointer-events: none`}></div>
    <div style="position: absolute; left: 28px; top: 136px; font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: #94A3B8; pointer-events: none">EXPRESSION</div>
    <div style=${`position: absolute; left: 10px; top: 546px; width: 540px; height: ${v.trayH}px; box-sizing: border-box; border-radius: 24px; border: 2px dashed rgba(148,163,184,0.28); background: rgba(255,255,255,0.02); opacity: ${v.trayOp}; pointer-events: none`}></div>
    <div style="position: absolute; left: 28px; top: 556px; font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: #94A3B8; pointer-events: none">TRAY</div>
    ${v.legacy ? html`<div style="position: absolute; left: 150px; right: 30px; top: 553px; font-size: 18px; color: #CBD5E1; text-align: right; pointer-events: none">𝑈: the plane 𝑥 − 2𝑦 + 𝑧 = 0 in ℝ³</div>` : null}

    ${v.groups.map((g) => html`
      <div style=${`position: absolute; left: ${g.x}px; top: ${g.y}px; width: ${g.w}px; height: ${g.h}px; z-index: ${g.z}; pointer-events: none; transform: scale(${g.scale}); transform-origin: 50% 50%; animation: ${g.anim}`}>
        <div style=${`position: absolute; left: ${g.bgL}px; right: 30px; top: 0; bottom: 0; border-radius: 24px; background: rgba(255,255,255,0.045); border: 1.5px solid rgba(255,255,255,0.08)`}></div>
        <button onPointerDown=${g.down} aria-label=${g.aria} style=${`position: absolute; left: ${g.lbx}px; top: 0; width: 26px; height: ${g.h}px; padding: 0; border: none; background: transparent; pointer-events: auto; touch-action: none; cursor: grab`}>
          <svg aria-hidden="true" width="26" height=${g.h} viewBox=${`0 0 26 ${g.h}`} style=${`position: absolute; left: 0; top: 0; overflow: visible; filter: drop-shadow(0 4px 0 ${g.lip}) drop-shadow(0 5px 8px rgba(0,0,0,0.35))`}><path d=${g.lD} fill=${g.col}></path><path d=${g.lTip} fill=${g.col}></path></svg>
        </button>
        <button onPointerDown=${g.down} aria-label=${g.aria} style=${`position: absolute; left: ${g.rbx}px; top: 0; width: 26px; height: ${g.h}px; padding: 0; border: none; background: transparent; pointer-events: auto; touch-action: none; cursor: grab`}>
          <svg aria-hidden="true" width="26" height=${g.h} viewBox=${`0 0 26 ${g.h}`} style=${`position: absolute; left: 0; top: 0; overflow: visible; filter: drop-shadow(0 4px 0 ${g.lip}) drop-shadow(0 5px 8px rgba(0,0,0,0.35))`}><path d=${g.rD} fill=${g.col}></path><path d=${g.rTip} fill=${g.col}></path></svg>
        </button>
        ${g.hasL ? html`
          <div style=${`position: absolute; left: -12px; top: ${g.bt}px; width: 34px; height: 30px; border-radius: 7px; background: ${g.lTagBg}; color: ${g.lTagFg}; box-shadow: ${g.lTagShadow}; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; opacity: ${g.lOp}; transition: opacity 0.35s ease`}>${g.lLabel}</div>
        ` : null}
        <div style=${`position: absolute; left: ${g.rTagX}px; top: ${g.bt}px; width: 40px; height: 30px; border-radius: 7px; background: ${g.rTagBg}; color: ${g.rTagFg}; box-shadow: 0 3px 0 ${g.rTagLip}, 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; white-space: nowrap`}>${g.rLabel}</div>
      </div>
    `)}

    ${v.pluses.map((p) => html`
      <button onClick=${p.tap} aria-label="Plus. Double-tap to line these terms up" style=${`position: absolute; left: ${p.x}px; top: ${p.y}px; width: 38px; height: 38px; padding: 0; border-radius: 19px; z-index: ${p.z}; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(148,163,184,0.20); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 26px; font-weight: 500; line-height: 34px; text-align: center; opacity: ${p.op}; pointer-events: ${p.pe}; transition: opacity 0.3s ease; cursor: pointer`}>+</button>
    `)}

    ${v.vecs.map((t) => html`
      <button onPointerDown=${t.down} aria-label=${t.aria} style=${`position: absolute; left: ${t.x}px; top: ${t.y}px; width: ${t.w}px; height: 88px; padding: 0; border: none; background: transparent; touch-action: none; cursor: grab; z-index: ${t.z}; transform: scale(${t.scale}); filter: drop-shadow(0 ${t.shadow}px 12px rgba(0,0,0,0.40)); animation: ${t.anim}; --dx: ${t.dx}px; --dy: ${t.dy}px; font-family: inherit`}>
        <span style="position: absolute; left: 0; top: 5px; width: 52px; height: 83px; display: block; clip-path: polygon(0 0, 30px 0, 52px 50%, 30px 100%, 0 100%, 22px 50%); background: #B7791F"></span>
        <span style="position: absolute; left: 0; top: 0; width: 52px; height: 83px; display: block; clip-path: polygon(0 0, 30px 0, 52px 50%, 30px 100%, 0 100%, 22px 50%); background: #F1E7CD">
          <span style="position: absolute; left: 0; top: 0; width: 52px; height: 30px; display: block; background: #C38F2A; box-shadow: inset 0 3px 6px rgba(60,38,0,0.60)"></span>
          <span style="position: absolute; left: 8px; top: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: #5A420E; font-size: 17px; font-weight: 700">𝐅</span>
        </span>
        <span style="position: absolute; left: 0; top: 5px; width: 100%; height: 83px; display: block; clip-path: polygon(33px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 33px 100%, 55px 50%); background: ${t.lip}"></span>
        <span style=${`position: absolute; left: 0; top: 0; width: 100%; height: 83px; display: block; clip-path: polygon(33px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 33px 100%, 55px 50%); background: ${t.face}`}>
          <span style="position: absolute; left: 0; top: 0; right: 0; height: 30px; box-sizing: border-box; padding: 0 26px 0 60px; display: flex; align-items: center; justify-content: center; background: #2F5BD3; color: #FFFFFF; font-size: 15px; font-weight: 700; white-space: nowrap">${t.type}</span>
          <span style=${`position: absolute; left: 0; top: 30px; right: 0; bottom: 0; box-sizing: border-box; padding: 0 26px 0 60px; display: flex; align-items: center; justify-content: center; font-size: ${t.elSize}px; color: ${t.fg}; white-space: nowrap`}>${t.el}</span>
        </span>
        ${t.hasField ? html`
          <span onPointerDown=${t.pieceDown} style=${`position: absolute; left: 0; top: 0; width: 46px; height: 34px; display: block; transform: scale(${t.pieceScale})`}>
            <span style="position: absolute; left: 0; top: 3px; width: 46px; height: 30px; display: block; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: #B7791F"></span>
            <span style=${`position: absolute; left: 0; top: 0; width: 46px; height: 30px; display: flex; align-items: center; justify-content: center; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: ${t.pieceBg}; color: #2A1D04; font-size: 17px; font-weight: 700`}>${t.fLabel}</span>
          </span>
        ` : null}
      </button>
    `)}

    ${v.hexes.map((t) => html`
      <button onPointerDown=${t.down} aria-label=${t.aria} style=${`position: absolute; left: ${t.x}px; top: ${t.y}px; width: 96px; height: 88px; padding: 0; border: none; background: transparent; touch-action: none; cursor: grab; z-index: ${t.z}; transform: translateY(${t.sink}px) scale(${t.scale}); filter: drop-shadow(0 ${t.shadow}px 12px rgba(0,0,0,0.40)); animation: ${t.anim}; --dx: ${t.dx}px; --dy: ${t.dy}px; font-family: inherit`}>
        <span style="position: absolute; left: 0; top: 5px; width: 100%; height: 83px; display: block; clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%); background: ${t.lip}"></span>
        <span style=${`position: absolute; left: 0; top: 0; width: 100%; height: 83px; display: flex; flex-direction: column; clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%); background: ${t.face}`}>
          <span style=${`height: 30px; display: flex; align-items: center; justify-content: center; background: ${t.band}; color: #2A1D04; font-size: 17px; font-weight: 700`}>${t.type}</span>
          <span style=${`flex: 1 1 auto; display: flex; align-items: center; justify-content: center; font-size: ${t.elSize}px; color: ${t.fg}; white-space: nowrap`}>${t.el}</span>
        </span>
      </button>
    `)}

    ${v.ghosts.map((t) => html`
      <div aria-hidden="true" style=${`position: absolute; left: ${t.x}px; top: ${t.y}px; width: 96px; height: 88px; z-index: 880; opacity: 0.5; pointer-events: none`}>
        <div style=${`position: absolute; left: 0; top: 0; width: 96px; height: 83px; display: flex; flex-direction: column; clip-path: ${t.clip}; background: ${t.face}`}>
          <div style=${`height: 30px; display: flex; align-items: center; justify-content: center; background: ${t.band}; color: ${t.bandFg}; font-size: 17px; font-weight: 700`}>${t.type}</div>
          <div style=${`flex: 1 1 auto; display: flex; align-items: center; justify-content: center; font-size: ${t.elSize}px; color: ${t.fg}; white-space: nowrap`}>${t.el}</div>
        </div>
      </div>
    `)}

    ${v.dots.map((b) => html`
      <div aria-hidden="true" style=${`position: absolute; left: ${b.x}px; top: ${b.y}px; width: 24px; height: 24px; border-radius: 12px; z-index: ${b.z}; background: #16130C; box-shadow: 0 0 0 2px #FFF8E6, 0 3px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; pointer-events: none`}><div style="width: 6px; height: 6px; border-radius: 3px; background: #FFF8E6"></div></div>
    `)}

    ${v.strips.map((t) => html`
      <button onPointerDown=${t.down} aria-label=${t.aria} style=${`position: absolute; left: ${t.x}px; top: ${t.y}px; width: 56px; height: 48px; padding: 0; border: none; background: transparent; touch-action: none; cursor: grab; z-index: ${t.z}; opacity: ${t.op}; pointer-events: ${t.pe}; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.40)); font-family: inherit`}>
        <span style="position: absolute; left: 5px; top: 12px; width: 46px; height: 30px; display: block; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: #B7791F"></span>
        <span style="position: absolute; left: 5px; top: 9px; width: 46px; height: 30px; display: flex; align-items: center; justify-content: center; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: #F2B33D; color: #2A1D04; font-size: 17px; font-weight: 700">${t.label}</span>
      </button>
    `)}

    ${v.parenSrc ? html`<button onPointerDown=${v.parenSrc.down} aria-label="Sum space: drag out a pair of brackets" style=${`position: absolute; left: ${v.parenSrc.x}px; top: ${v.parenSrc.y}px; width: 150px; height: 64px; border-radius: 16px; border: 2px dashed rgba(203,213,225,0.55); background: rgba(255,255,255,0.07); color: #E2E8F0; font-size: 30px; touch-action: none; cursor: grab; z-index: ${v.parenSrc.z}; opacity: ${v.parenSrc.op}; pointer-events: ${v.parenSrc.pe}; font-family: inherit`}>( + )</button>` : null}

    ${v.results.map((r) => html`
      <div style=${`position: absolute; left: ${r.x}px; top: ${r.y}px; max-width: 520px; padding: 8px 16px; border-radius: 14px; background: ${r.bg}; border: 1.5px solid ${r.border}; color: ${r.fg}; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; pointer-events: none; z-index: 950`}>
        <span style="font-size: 24px; font-weight: 600">${r.main}</span>
        <span style="font-family: Inter, system-ui, sans-serif; font-size: 15px; font-weight: 500">${r.note}</span>
      </div>
    `)}
    ${v.flashes.map((r) => html`
      <div style=${`position: absolute; left: ${r.x}px; top: ${r.y}px; max-width: 480px; padding: 8px 16px; border-radius: 14px; background: ${r.bg}; border: 1.5px solid ${r.border}; color: ${r.fg}; font-family: Inter, system-ui, sans-serif; font-size: 18px; font-weight: 600; pointer-events: none; z-index: 960`}>${r.text}</div>
    `)}

  </div>
  <div style=${`position: absolute; left: 0; top: 0; width: 560px; height: ${v.overlayH}px; transform: scale(${v.baseScale}); transform-origin: 0 0; pointer-events: none`}>
    <div style="position: absolute; right: 18px; bottom: 108px; display: flex; flex-direction: column; gap: 10px; pointer-events: auto">
      <button onClick=${v.zoomIn} aria-label="Zoom in" style="width: 60px; height: 60px; border-radius: 30px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 30px; line-height: 1; cursor: pointer">+</button>
      <button onClick=${v.zoomOut} aria-label="Zoom out" style="width: 60px; height: 60px; border-radius: 30px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 30px; line-height: 1; cursor: pointer">−</button>
    </div>
    ${v.showReset ? html`
      <button onClick=${v.zoomReset} style="position: absolute; right: 18px; bottom: 254px; height: 52px; padding: 0 18px; border-radius: 26px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 18px; font-weight: 600; pointer-events: auto; cursor: pointer">${v.zoomPct}% · Reset</button>
    ` : null}
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 68px; background: linear-gradient(rgba(18,26,43,0), rgba(18,26,43,0.95) 40%)"></div>
    <div style="position: absolute; left: 24px; right: 24px; bottom: 16px; text-align: center; font-family: Inter, system-ui, sans-serif; font-size: 16px; line-height: 22px; color: #94A3B8">${v.hint}</div>
  </div>
</div>
`;
  }
}
