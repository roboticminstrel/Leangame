// The Range: an expression playground for scalars, vectors and sums (PROTOTYPE, written by Claude).
// Ported from the design-canvas prototype: same logic class, rendered with Preact + htm (vendored, no build step).
import { Component } from '../../vendor/preact.mjs';
import { html } from '../html.js';
import { ConceptGraph } from '../graph/ConceptGraph.js';
import { LeanPlay } from '../lean/LeanPlay.js';
import { LEVELS, progressFrom, browserStore, memoryStore } from '../levels.js';

export class Range extends Component {
  constructor(props) {
    super(props);
    this.uid = 1;
    this.K = { BIT: 52, PAREN: 18, SPAD: 18, ZT: 126, ZB: 526, WW: 560, ZW: 110, GAP: 52 };
    if (!props.legacy) Object.assign(this.K, { AY: 84, GY: 192, ZT: 300, ZB: 700 }); // ASSUMPTIONS, GOAL, EXPRESSION
    this.P = new Map();
    this.M = new Map();
    // progress (done nodes, each level's place) lives in the browser; tests pass a memory store
    this.store = props.store || (typeof localStorage !== 'undefined' && !props.legacy && !props.demo ? browserStore() : memoryStore());
    this.prog = progressFrom(this.store);
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
      // Rules mode only; the tray holds the two zeros (0 in ℝ, 0 in 𝑉), each an endless supply, and what the player
      // taps. Level 1 (Axler 1.30): from 0·𝑣 reach the zero vector. props.demo: the earlier (2 + 3)𝑣 + −1𝑣 (tests).
      const Y = this.K.ZT + 110;
      const level = this.props.level || this.prog.current;
      if (!this.props.demo) this.layoutFor(level);
      const L = this.loadLevel(level);
      const tops = this.props.demo
        ? [{ node: this.mkProd([g], this.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 24, y: Y },
          { node: this.mkProd([this.mkS('R', '−1', '-1')], this.mkV('𝑉', '𝑣', 'v', 'R', 140)), x: 214, y: Y + 168 }]
        : L.tops;
      this.hist = this.props.demo ? { entries: [{ tops: this.clone(tops), steps: [] }], idx: 0 } : L.hist;
      return Object.assign(base, {
        rules: true, trayOpen: false, trayTab: 'tray', trayItems: [], trayNew: {}, slides: {}, tiles: { assume: true, goal: true },
        level: level, ws: L.ws || 'expr', boards: L.boards || {}, goal: this.props.demo ? this.mkV('𝑉', '0', 'zero', 'R', 110) : L.goal, hyps: this.props.demo ? [] : L.hyps, vars: this.props.demo ? null : L.vars, scalars: this.props.demo ? null : L.scalars,
        tops: tops,
        pieces: [
          { id: 'PZS', kind: 'zeroS', x: 30, y: 600, hx: 30, hy: 600 },
          { id: 'PZ', kind: 'zero', x: 150, y: 600, hx: 150, hy: 600 },
          { id: 'PO', kind: 'one', x: 280, y: 600, hx: 280, hy: 600 }
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
  // The board as a tree for the Lean server (server/render.py), in reading order; null where Lean can't write it yet
  // (½, 𝑖, a vector without a one-letter name)
  leanTree(n) {
    if (n.t === 's') {
      const v = String(n.val);
      if (/^-?\d+$/.test(v)) return { n: parseInt(v, 10) };
      if (/^-?[a-z]$/.test(v)) return v.charAt(0) === '-' ? { neg: { s: v.slice(1) } } : { s: v }; // a symbolic scalar
      return null;
    }
    if (n.t === 'v') {
      if (n.key === 'zero') return { zero: true };
      if (!/^[a-z][0-9]?$/.test(n.key || '')) return null; // the server's names: a letter, maybe a digit (𝑤′ is w2)
      return n.neg ? { neg: { v: n.key } } : { v: n.key };
    }
    let core;
    if (n.t === 'prod') {
      const o = this._orderOverride;
      const facs = o && o.key === n.id ? this.readingOrder(n.factors, n.id) : n.factors;
      const fs = this.groupTrees(facs, n.id, 'mul'); if (fs.some(x => !x)) return null;
      const sc = fs.length === 1 ? fs[0] : fs.length ? { mul: fs } : null;
      if (!n.vec) core = sc;
      else { const v = this.leanTree(n.vec); if (!v) return null; core = sc ? { smul: [sc, v] } : v; }
    } else core = this.leanSum(n.terms.map(t => t.node), n.id);
    if (!core) return null;
    if (n.inv) core = { inv: core };
    if (n.neg) core = { neg: core };
    return core;
  }
  // For Lean, a pair that a law acts on must be one sub-expression: _leanGroup brackets the given members together,
  // each part on its own (x, −x), or a run as one bracket ((a + b), −(a + b)).
  groupTrees(ordered, key, op) {
    const trees = ordered.map(x => ({ id: x.id, t: this.leanTree(x) }));
    const g = this._leanGroup;
    if (!g || g.key !== key) return trees.map(x => x.t);
    const inG = new Set([].concat(...g.parts)); const out = []; let placed = false;
    trees.forEach(x => {
      if (!inG.has(x.id)) { out.push(x.t); return; }
      if (placed) return; placed = true;
      const parts = g.parts.map(ids => { const ts = ids.map(id => (trees.find(y => y.id === id) || {}).t); return ts.length === 1 ? ts[0] : { [op]: ts }; });
      out.push(parts.length === 1 ? parts[0] : { [op]: parts });
    });
    return out;
  }
  leanSum(nodes, key) {
    const ts = this.groupTrees(this.readingOrder(nodes, key), key, 'add');
    if (!ts.length || ts.some(x => !x)) return null;
    return ts.length === 1 ? ts[0] : { add: ts };
  }
  readingOrder(ns, key) {
    const o = this._orderOverride;
    if (o && key != null && o.key === key) return ns.slice().sort((a, b) => o.ids.indexOf(a.id) - o.ids.indexOf(b.id));
    const pos = n => this.P.get(n.id) || { x: 0, y: 0 };
    return ns.slice().sort((a, b) => Math.abs(pos(a).y - pos(b).y) > 60 ? pos(a).y - pos(b).y : pos(a).x - pos(b).x);
  }
  leanList(ns) { const ts = ns.map(n => this.leanTree(n)); return ts.length === 1 ? ts[0] : { add: ts }; }
  leanHyps() { return (this.state.hyps || []).filter(h => !h.wit).map(h => [this.leanList(h.lhs), this.leanList(h.rhs)].concat(h.bind ? [h.bind] : [])); }
  zoneTree() { return this.leanSum(this.state.tops.filter(t => this.zoneIds.indexOf(t.node.id) >= 0).map(t => t.node), 'zone'); }
  // ---------- workspaces: the expression, the goal and each hypothesis each have a board; one is in the box at a
  // time. A hypothesis's board is its equation in two rows (its left side, then = and its right side), each row a
  // chain of its own ('zone' and 'zoneR'); the others have one chain ('zone').
  isHypWs(ws) { return !!ws && ws !== 'expr' && ws !== 'goal'; }
  zm(ws) { return this.isHypWs(ws === undefined ? this.state.ws : ws) ? this.K.ZT + 239 : Infinity; }
  zoneSetOf(id) { return (this.zoneSets || []).find(z => z.ids.indexOf(id) >= 0) || null; }
  inZone(id) { return !!this.zoneSetOf(id); }
  zoneMates(id) { const z = this.zoneSetOf(id); return z ? z.ids : []; }
  zoneKeyOf(id) { const z = this.zoneSetOf(id); return z ? z.key : null; }
  isZoneKey(k) { return k === 'zone' || k === 'zoneR'; }
  zoneNodes(key, tops) {
    const z = (this.zoneSets || []).find(x => x.key === key); const ts = tops || this.state.tops;
    return z ? this.readingOrder(z.ids.map(id => (ts.find(t => t.node.id === id) || {}).node).filter(Boolean), key) : [];
  }
  // what Lean sees of the board in the box: a tree, or [lhs, rhs] for a hypothesis
  wsTree() {
    if (this.isHypWs(this.state.ws)) return [this.leanSum(this.zoneNodes('zone'), 'zone'), this.leanSum(this.zoneNodes('zoneR'), 'zoneR')];
    return this.zoneTree();
  }
  // the expression's terms, wherever its board is (in the box, or put away while another board is out)
  boardRun(tops) { const K = this.K; return tops.filter(t => { const m = this.measure(t.node); const cy = t.y + m.h / 2; return cy > K.ZT && cy < K.ZB; }).sort((a, b) => Math.abs(a.y - b.y) > 60 ? a.y - b.y : a.x - b.x).map(t => t.node); }
  exprRun() { const St = this.state; return (!St.ws || St.ws === 'expr') ? this.zoneNodes('zone') : this.boardRun((St.boards || {}).expr || []); }
  runCanon(ns) { return ns.length === 1 ? this.canon(ns[0]) : 'g(' + ns.map(n => this.canon(n)).sort().join('+') + ')'; }
  isWon() { const St = this.state; if (this.props.legacy || !St.goal) return false; const run = this.exprRun(); return run.length > 0 && this.runCanon(run) === this.canon(St.goal); }
  wsTitle(ws) { if (!ws || ws === 'expr') return 'EXPRESSION'; if (ws === 'goal') return 'GOAL · ' + (this.state.level || ''); const h = (this.state.hyps || []).find(x => x.name === ws); return 'HYPOTHESIS ' + (h ? h.label : ''); }
  // a board seen for the first time: the goal's terms in a row, or a hypothesis's sides in two
  wsStart(target, goalIn, hypsIn) {
    const K = this.K; const row = (ns, y) => ns.map((n, i) => ({ node: this.cloneFresh(n), x: 24 + i * 200, y: y }));
    if (target === 'goal') { const g = goalIn || this.state.goal; return row(g.t === 'sum' && !this.flagged(g) ? g.terms.map(t => t.node) : [g], K.ZT + 110); }
    const h = (hypsIn || this.state.hyps || []).find(x => x.name === target);
    return row(h.lhs, K.ZT + 110).concat(row(h.rhs, K.ZT + 270));
  }
  // Put this board away and bring another into the box. The board left keeps its state. Animated unless instant:
  // the tiles fall away into the distance, the box shrinks to its heading and readout, the two swing past each other
  // (the box's one up into the header, the other down into the box), and the new tiles come in from far away.
  switchWs(target, opts) {
    const St = this.state; const cur = St.ws || 'expr';
    if (!target || target === cur || this.drag || this.idrag || this.hdrag || St.wsAnim) return;
    if (this.isHypWs(target) && !(St.hyps || []).some(h => h.name === target)) return;
    const boards = Object.assign({}, St.boards || {}, { [cur]: this.clone(St.tops) });
    const next = boards[target] ? this.clone(boards[target]) : this.wsStart(target);
    const commit = () => { this._wsSwitch = true; this.setState({ ws: target, boards: boards, tops: this.normTops(this.tidy(next, target)), tree: null, zeroHover: null, preview: null, slides: {}, slide: null }); };
    if ((opts && opts.instant) || typeof window === 'undefined') { commit(); return; }
    const zb = this._zb || { l: 14, r: 300, t: this.K.ZT, b: this.K.ZT + 120 };
    const heads = this.headVals();
    const fromSlot = this.slotPos(heads, target), toSlot = this.slotPos(heads, cur === 'expr' ? target : cur);
    const ro = this.state.tops.length ? this.readoutOf(this.state.tops) : null;
    const a = { title: this.wsTitle(cur), text: ro ? ro.tokens.map(k => k.t).join('') : '' };
    const b = { title: this.wsTitle(target), text: this.wsText(target) };
    const anim = { from: cur, to: target, vp: { x: (zb.l + zb.r) / 2, y: (zb.t + zb.b) / 2 }, fly: [
      Object.assign({ x0: 28, y0: this.K.ZT + 6, x1: toSlot.x, y1: toSlot.y }, a), Object.assign({ x0: fromSlot.x, y0: fromSlot.y, x1: 28, y1: this.K.ZT + 6 }, b)] };
    this.setState({ wsAnim: Object.assign({ phase: 'out' }, anim) });
    clearTimeout(this._wsT1); clearTimeout(this._wsT2); clearTimeout(this._wsT3);
    this._wsT1 = setTimeout(() => { commit(); this.setState({ wsAnim: Object.assign({ phase: 'swing' }, anim) }); }, 340);
    this._wsT2 = setTimeout(() => this.setState({ wsAnim: Object.assign({ phase: 'in' }, anim) }), 340 + 520);
    this._wsT3 = setTimeout(() => this.setState({ wsAnim: null }), 340 + 520 + 560);
  }
  // Taps in the header: a single tap does its usual thing (toggle the tiles) a moment later, unless a second tap
  // on the same thing comes first: then that thing's board comes into the box
  headTap(target, toggle, now) {
    const t = now != null ? now : Date.now(); const last = this._lastTap;
    clearTimeout(this._tapT);
    if (target && last && last.target === target && t - last.t < 380) { this._lastTap = null; this.switchWs(target); return; }
    this._lastTap = { target: target, t: t };
    if (!toggle) return;
    if (!target || typeof window === 'undefined') { toggle(); return; }
    this._tapT = setTimeout(toggle, 300);
  }
  // a board's readout as text, when it isn't in the box
  wsText(ws) {
    const St = this.state;
    if (ws === 'expr') return this.exprText(this.exprRun(), true);
    if (ws === 'goal') return this.exprText(St.goal.t === 'sum' && !this.flagged(St.goal) ? St.goal.terms.map(t => t.node) : [St.goal], true);
    const h = (St.hyps || []).find(x => x.name === ws); return h ? this.exprText(h.lhs, true) + ' = ' + this.exprText(h.rhs, true) : '';
  }
  // where a board's place in the header is (world units): the GOAL line, or a hypothesis in ASSUMPTIONS
  slotPos(heads, ws) {
    const H = heads || [];
    if (ws === 'goal' || ws === 'expr') { const g = H[1]; return { x: 28, y: (g ? g.y : this.K.GY) + 30 }; }
    const A = H[0]; if (!A) return { x: 28, y: this.K.AY };
    for (let ri = 0; ri < A.rows.length; ri++) {
      let x = 28;
      for (const k of A.rows[ri]) {
        if ((k.hyp && k.hyp.name === ws) || (k.slot && k.ws === ws)) return { x: x, y: A.y + 27 + ri * 58 + 9 };
        x += (k.tile ? k.width : k.w) + (k.hyp || k.slot ? 24 : 0);
      }
    }
    return { x: 28, y: A.y + 27 };
  }
  // ---------- levels: a level's place is its move history (each entry the board after a move, with the Lean steps
  // that move sent) and where in it the player is ----------
  // the header's height depends on the level: a line for its vectors and one for its hypotheses, when it has them
  // hyps: the hypotheses now in play (the level's own, plus a line per witness); by default the saved place's
  layoutFor(id, hyps) {
    const L = LEVELS[id] || LEVELS['1.30']; const b = L.build(this);
    if (!hyps) { const pl = this.prog.places[L.id]; const e = pl && pl.entries && pl.entries[pl.idx]; hyps = (e && e.hyps) || b.hyps || []; }
    const rows = (b.vars ? 1 : 0) + (hyps.some(h => !h.wit) ? 1 : 0) + hyps.filter(h => h.wit).length;
    const extra = rows * 58;
    Object.assign(this.K, { AY: 84, GY: 192 + extra, ZT: 300 + extra, ZB: 700 + extra });
  }
  // the header grew or shrank (a witness line came or went): everything below moves by the same amount
  relayout(hyps, tops) {
    const old = this.K.ZT; this.layoutFor(this.state.level, hyps);
    const d = this.K.ZT - old;
    if (d) {
      tops.forEach(t => { t.y += d; });
      const b = this.state.boards || {}; const nb = {};
      Object.keys(b).forEach(k => { nb[k] = b[k].map(t => Object.assign({}, t, { y: t.y + d })); });
      this.setState({ boards: nb });
    }
    return tops;
  }
  loadLevel(id) {
    const L = LEVELS[id] || LEVELS['1.30'];
    const b = L.build(this);
    const extra = { goal: b.goal, hyps: b.hyps || [], vars: b.vars || null, scalars: b.scalars || null };
    const place = this.prog.places[L.id];
    if (place && place.entries && place.entries[place.idx]) {
      this.bumpUid(place.entries);
      const e = place.entries[place.idx];
      return Object.assign(extra, { tops: this.clone(e.tops), hyps: e.hyps ? this.clone(e.hyps) : extra.hyps, goal: e.goal ? this.clone(e.goal) : extra.goal,
        ws: e.ws || 'expr', boards: e.boards ? this.clone(e.boards) : {}, hist: { entries: place.entries, idx: place.idx } });
    }
    const tops = b.start.map((n, i) => ({ node: n, x: 24 + i * 200, y: this.K.ZT + 110 }));
    return Object.assign(extra, { tops: tops, hist: { entries: [{ tops: this.clone(tops), steps: [] }], idx: 0 } });
  }
  // ids loaded from storage must not collide with new ones
  bumpUid(x) { const m = JSON.stringify(x).match(/"id":"[a-zA-Z]+(\d+)"/g) || []; m.forEach(t => { const k = parseInt(t.replace(/\D/g, ''), 10); if (k >= this.uid) this.uid = k + 1; }); }
  savePlace() {
    if (this.props.legacy || this.props.demo) return;
    const lv = this.state.level;
    this.prog.places[lv] = { entries: this.hist.entries, idx: this.hist.idx };
    this.prog.current = lv;
    this.store.save(this.prog);
  }
  // Start (or go back to) another level: this one's place is saved, the other's restored where it was left
  switchLevel(id) {
    if (!LEVELS[id]) return;
    this.savePlace();
    this.layoutFor(id);
    const L = this.loadLevel(id);
    this.layoutFor(id, L.hyps);
    this.hist = L.hist; this._histKey = null; this._resync = true;
    this.setState({ level: id, goal: L.goal, hyps: L.hyps, vars: L.vars, scalars: L.scalars, ws: L.ws || 'expr', boards: L.boards || {}, wsAnim: null, tops: this.normTops(this.tidy(L.tops, L.ws || 'expr')), tree: null, trayClosing: true, histAnim: true, zeroHover: null, preview: null });
    clearTimeout(this._tc); this._tc = setTimeout(() => this.setState({ trayOpen: false, trayClosing: false, trayTab: 'tray' }), 220);
    clearTimeout(this._ha); this._ha = setTimeout(() => this.setState({ histAnim: false }), 450);
    this.prog.current = id; this.store.save(this.prog);
  }
  // the expression as an ordered structure (what a move changes; positions only matter through reading order)
  okey(n) {
    let k;
    if (n.t === 's') k = 's:' + n.val;
    else if (n.t === 'v') k = 'v:' + n.type + ':' + (n.neg ? '-' : '') + n.el;
    else if (n.t === 'prod') k = 'p(' + n.factors.map(f => this.okey(f)).join('*') + '|' + (n.vec ? this.okey(n.vec) : '') + ')';
    else k = 'g(' + this.readingOrder(n.terms.map(t => t.node), n.id).map(x => this.okey(x)).join('+') + ')';
    return (n.neg ? '-' : '') + k + (n.inv ? '^-1' : '');
  }
  histKey() { return (this.state.ws || 'expr') + ':' + (this.zoneSets || [{ key: 'zone' }]).map(z => this.zoneNodes(z.key).map(n => this.okey(n)).join(' + ')).join(' = '); }
  canUndo() { return !!this.hist && this.hist.idx > 0; }
  canRedo() { return !!this.hist && this.hist.idx < this.hist.entries.length - 1; }
  undo() {
    if (!this.canUndo() || this.drag) return;
    const e = this.hist.entries[this.hist.idx]; this.hist.idx--;
    // one chain for every board: the board in the box stays there (a move undone on another board only changes its
    // text in the header)
    this.restore(this.hist.entries[this.hist.idx], { steps: e.steps.slice().reverse().map(st => [st[1], st[0], st[2], null, st[4] || null]) }, this.state.ws || 'expr');
  }
  redo() {
    if (!this.canRedo() || this.drag) return;
    this.hist.idx++; const e = this.hist.entries[this.hist.idx];
    this.restore(e, { steps: e.steps }, this.state.ws || 'expr');
  }
  // all the way back to the start; redo still walks forward until a new move overwrites what's ahead
  rewind() {
    if (!this.canUndo() || this.drag) return;
    this.hist.idx = 0;
    this.restore(this.hist.entries[0], { restart: true, steps: [] }, this.state.ws || 'expr');
  }
  restore(entry, R, wsWanted) {
    this._restoring = R;
    const lv = LEVELS[this.state.level];
    const hyps = entry.hyps ? this.clone(entry.hyps) : (lv ? (lv.build(this).hyps || []) : (this.state.hyps || []));
    if (!this.props.demo) this.layoutFor(this.state.level, hyps); // the header for that moment, then the row under it
    const goal = entry.goal ? this.clone(entry.goal) : (lv ? lv.build(this).goal : this.state.goal);
    let ws = entry.ws || 'expr'; const boards = entry.boards ? this.clone(entry.boards) : {};
    let tops = this.clone(entry.tops);
    // the board to show: the one asked for, if it exists at that moment (a witness may not yet), else the expression
    const want = wsWanted && (wsWanted === 'goal' || wsWanted === 'expr' || hyps.some(h => h.name === wsWanted)) ? wsWanted : (wsWanted ? 'expr' : ws);
    if (want !== ws) { boards[ws] = tops; tops = boards[want] ? boards[want] : this.wsStart(want, goal, hyps); delete boards[want]; ws = want; }
    this.setState({ hyps: hyps, goal: goal, ws: ws, boards: boards, wsAnim: null,
      tops: this.normTops(this.tidy(tops, ws)), histAnim: true, zeroHover: null, preview: null, slide: null, slides: {} });
    clearTimeout(this._ha); this._ha = setTimeout(() => this.setState({ histAnim: false }), 450);
  }
  // aligned spots: the expression's terms in one row, in reading order, brackets lined up inside
  tidy(tops, ws) {
    const K = this.K; const ZM = this.zm(ws);
    const cyOf = t => t.y + this.measure(t.node).h / 2;
    const inZone = t => { const cy = cyOf(t); return cy > K.ZT && cy < K.ZB; };
    const zone = tops.filter(inZone).sort((a, b) => Math.abs(a.y - b.y) > 60 ? a.y - b.y : a.x - b.x);
    // one row; a hypothesis gets two, its left side and (after the =) its right side
    const rows = ZM < Infinity ? [zone.filter(t => cyOf(t) < ZM), zone.filter(t => cyOf(t) >= ZM)] : [zone];
    rows.forEach((row, ri) => {
      const cy = K.ZT + 110 + 49 + ri * 160;
      let x = 24 + (ri ? 56 : 0) + (row[0] && this.negCluster(row[0].node) ? 46 : 0);
      row.forEach(t => {
        this.walk(t.node, m => { if (m.t === 'sum') this.rowArrange(m); }, null, null);
        const m = this.measure(t.node); t.x = x; t.y = cy - m.h / 2; x += m.w + K.GAP;
      });
    });
    return tops;
  }
  // won: the expression is exactly the goal; the level's node is done (which can open new ones in the graph)
  checkWin() {
    if (this.isWon() && this.prog.done.indexOf(this.state.level) < 0) {
      this.prog.done = this.prog.done.concat([this.state.level]);
    }
  }
  // After each finished move (nothing being dragged): if the expression changed, record it in the level's history
  // (dropping anything ahead after an undo), and tell the live proof. Undo and redo replay the move's own Lean steps
  // (reversed for undo); rewind restarts the proof.
  noteBoard() {
    if (this.props.legacy || !this.zoneIds) return;
    if (this.drag || this.pdrag || this.idrag) return;
    const L = this.props.lean;
    if (this._resync) { this._resync = false; this.syncLean(); return; }
    // another board came into the box: nothing moved, Lean now follows that board
    if (this._wsSwitch) { this._wsSwitch = false; this._histKey = this.histKey(); this._leanTree = this.wsTree(); return; }
    const key = this.histKey();
    if (this._histKey == null) this._histKey = key;
    if (key === this._histKey) { this._hint = null; return; }
    this._histKey = key;
    const t = this.wsTree(); const from = this._leanTree; this._leanTree = t;
    const St = this.state; const ws = St.ws || 'expr';
    const R = this._restoring; this._restoring = null;
    let steps;
    if (R) steps = R.steps;
    else {
      steps = [];
      // a cancellation goes to Lean in two steps: first the terms rearranged so the pair sits together, then the law
      const mid = this._leanMid; this._leanMid = null;
      const sg = this._splitGroup; this._splitGroup = null;
      if (sg) {
        // a split: the law makes the pair as one bracket, then the bracket opens into the sum or product (a witness
        // from the inverse axiom is obtained first, with that step)
        this._leanGroup = sg; const m2 = this.wsTree(); this._leanGroup = null;
        steps.push([from, m2, this._hint || null].concat(this._witness ? [this._witness] : []), [m2, t, null]);
        this._witness = null;
      } else if (mid && JSON.stringify(mid) !== JSON.stringify(from)) steps.push([from, mid, null], [mid, t, this._hint || null]);
      else steps.push([from, t, this._hint || null]);
      // a move on the goal or on a hypothesis changes it (and Lean gets it as a goal or hypothesis step)
      let goal = St.goal, hyps = St.hyps || [], target = null;
      if (ws === 'goal') {
        const run = this.zoneNodes('zone').map(n => this.clone(n));
        if (run.length) { goal = run.length === 1 ? run[0] : this.mkSum(run.map(n => ({ node: n, x: 0, y: 0 }))); this.setState({ goal: goal }); }
        target = { goal: true };
      } else if (this.isHypWs(ws)) {
        const L = this.zoneNodes('zone').map(n => this.clone(n)), Rr = this.zoneNodes('zoneR').map(n => this.clone(n));
        const h0 = hyps.find(h => h.name === ws);
        hyps = hyps.map(h => h.name === ws ? Object.assign({}, h, { lhs: L, rhs: Rr }) : h);
        this.setState({ hyps: hyps });
        target = { hyp: ws, bind: (h0 && h0.bind) || null };
      }
      steps = steps.map(st => [st[0], st[1], st[2], st[3] || null, target]);
      const H = this.hist;
      H.entries = H.entries.slice(0, H.idx + 1).concat([{ tops: this.clone(St.tops), steps: steps, hyps: this.clone(hyps), goal: this.clone(goal), ws: ws, boards: this.clone(St.boards || {}) }]);
      if (H.entries.length > 200) H.entries = H.entries.slice(H.entries.length - 200);
      H.idx = H.entries.length - 1;
      this.checkWin();
    }
    if (L) {
      if (R && R.restart) this.leanLevel(L);
      else steps.forEach(st => L.boardChanged(st[0], st[1], st[2], st[3] || null, st[4] || null));
    }
    this.savePlace();
    this._hint = null;
  }
  componentDidUpdate() { this.noteBoard(); }
  // The level's live proof starts from the board as it is now (its start) toward the goal
  initLean() {
    if (this.props.legacy) return;
    this.syncLean();
    if (this.props.lean) this._unsub = this.props.lean.subscribe((status, live) => this.setState({ leanStatus: status, leanLive: live }));
  }
  // the live proof for the current level: from its start, with the moves up to where the player is replayed
  syncLean() {
    this._leanTree = this.wsTree(); this._histKey = this.histKey();
    const L = this.props.lean; if (!L) return;
    const H = this.hist;
    this.leanLevel(L);
    for (let i = 1; i <= H.idx; i++) H.entries[i].steps.forEach(st => L.boardChanged(st[0], st[1], st[2], st[3] || null, st[4] || null));
  }
  // the theorem as the level states it (moves on the goal and the hypotheses come later, as steps)
  leanLevel(L) {
    const H = this.hist; const e0 = H && H.entries[0];
    const lv = LEVELS[this.state.level];
    const b = lv && !this.props.demo ? lv.build(this) : null;
    const start = e0 && !this.props.demo ? this.leanSum(this.boardRun(e0.tops), 'start') : (this.state.ws === 'expr' || !this.state.ws ? this.zoneTree() : null);
    const hyps = b ? (b.hyps || []).map(h => [this.leanList(h.lhs), this.leanList(h.rhs)].concat(h.bind ? [h.bind] : [])) : this.leanHyps();
    L.setLevel(start || this.zoneTree(), this.leanTree(b ? b.goal : this.state.goal), hyps);
  }
  componentDidMount() {
    this.initLean();
    this._openLean = () => this.setState({ trayOpen: true, trayClosing: false, trayTab: 'lean' });
    window.addEventListener('leangame:lean', this._openLean);
    this._rs = () => { if (this.board) { const r = this.board.getBoundingClientRect(); this.setState({ bw: r.width, bh: r.height }); } };
    this._rs();
    window.addEventListener('resize', this._rs);
    this.ptrs = new Map();
    this._mv = e => { if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.pinch) this.pinchMove(); else if (this.drag) this.move(e); else if (this.pdrag) this.pmove(e); else if (this.idrag) this.imove(e); else if (this.hdrag) this.hmove(e); else if (this.panning) this.panMove(e); };
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
        if (!this.drag && !this.pdrag && !this.idrag && !this.hdrag) return;
      }
      if (this.drag) this.end(); else if (this.pdrag) this.pend(); else if (this.idrag) this.iend(); else if (this.hdrag) this.hend(); else if (this.panning) this.panning = null; else if (this.state.holding) this.setState({ holding: null });
    };
    window.addEventListener('pointermove', this._mv);
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
  }
  componentWillUnmount() {
    if (this._unsub) this._unsub();
    window.removeEventListener('leangame:lean', this._openLean);
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
  // A cluster (product or sum) can carry neg (its additive inverse, −(…)) and, for scalars, inv (its multiplicative
  // inverse, (…)⁻¹). A flagged cluster keeps its shape: it's never flattened into its parent or collapsed.
  flagged(n) { return !!(n && (n.t === 'prod' || n.t === 'sum') && (n.neg || n.inv)); }
  negCluster(n) { return !!(n && (n.t === 'prod' || n.t === 'sum') && n.neg); }
  normalize(n) {
    if (!n) return null;
    if (n.t === 'prod') {
      let fs = [];
      n.factors.forEach(f => { const g = this.normalize(f); if (!g) return; if (g.t === 'prod' && !g.vec && !this.flagged(g)) fs = fs.concat(g.factors); else fs.push(g); });
      n.factors = fs; n.vec = this.normalize(n.vec);
      if (this.flagged(n)) return fs.length || n.vec ? n : null;
      if (!fs.length) return n.vec;
      if (fs.length === 1 && !n.vec) return fs[0];
      return n;
    }
    if (n.t === 'sum') {
      const out = []; let flat = false;
      n.terms.forEach(t => {
        const c = this.normalize(t.node); if (!c) return;
        if (c.t === 'sum' && !this.flagged(c)) { flat = true; c.terms.forEach(it => out.push({ node: it.node, x: t.x + it.x, y: t.y + it.y })); }
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
        if (t.node.t === 'sum' && t.node.terms.length >= 2 && inZone(t) && !this.flagged(t.node)) {
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
    if (String(v).charAt(0) === '-' && v !== '-1' && v !== '-i') { const c = this.cval(String(v).slice(1)); return [-c[0], -c[1]]; }
    const M = { '1': [1, 0], '-1': [-1, 0], '0': [0, 0], '2': [2, 0], '3': [3, 0], '√2': [Math.SQRT2, 0], '½': [0.5, 0], 'i': [0, 1], '1+i': [1, 1], '-i': [0, -1] };
    return M[v] || [1, 0];
  }
  mulC(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  addC(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  evalN(n) {
    if (this.flagged(n)) {
      let e = this.evalN(Object.assign({}, n, { neg: false, inv: false }));
      if (!e) return null;
      if (n.inv) { if (e.k !== 's') return null; const d = e.c[0] * e.c[0] + e.c[1] * e.c[1]; if (d < 1e-18) return null; e = { k: 's', c: [e.c[0] / d, -e.c[1] / d] }; }
      if (n.neg) e = e.k === 's' ? { k: 's', c: [-e.c[0], -e.c[1]] } : this.scaleV(e, [-1, 0]);
      return e;
    }
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
    if (this.flagged(n)) m = { w: m.w + 24 + (n.inv ? 26 : 0), h: m.h + 20, inner: m, pad: { x: 12, y: 10 } };
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
  plusesFor(items, z, gid, out, nodes) {
    const pts = items.map(p => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 }));
    const path = this.bestPath(pts, items);
    const on = new Set();
    for (let i = 1; i < path.length; i++) { const a = Math.min(path[i - 1], path[i]), b = Math.max(path[i - 1], path[i]); on.add(a + '-' + b); }
    const neg = i => !!(nodes && this.negCluster(nodes[i]));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const lit = on.has(i + '-' + j);
      const gm = this.gapMid(items[i], items[j]);
      const right = pts[i].x > pts[j].x ? i : j;
      out.push({ x: gm.x - 19, y: gm.y - 19, z: z, op: lit ? 1 : 0, pe: lit ? 'auto' : 'none', tap: this.tapPlus(gid), sym: neg(right) ? '−' : '+' });
    }
    if (pts.length) {
      let first = 0; pts.forEach((p, i) => { if (p.x < pts[first].x) first = i; });
      if (neg(first)) out.push({ x: items[first].x - 46, y: pts[first].y - 19, z: z, op: 1, pe: 'none', tap: null, sym: '−' });
    }
    return path;
  }
  layout(tops) {
    this.M = new Map(); this.P = new Map();
    const R = { hexes: [], vecs: [], groups: [], dots: [], pluses: [], boxes: [] };
    this._R = R;
    tops.forEach(t => { this.measure(t.node); this.place(t.node, t.x, t.y, 0, { z: 4 }); });
    const zoneItems = tops.filter(t => { const p = this.P.get(t.node.id); const cy = p.y + p.h / 2; return cy > this.K.ZT && cy < this.K.ZB; });
    this.zoneIds = zoneItems.map(t => t.node.id);
    const ZM = this.zm(); const cyOf = t => { const p = this.P.get(t.node.id); return p.y + p.h / 2; };
    const bands = ZM < Infinity ? [['zone', zoneItems.filter(t => cyOf(t) < ZM)], ['zoneR', zoneItems.filter(t => cyOf(t) >= ZM)]] : [['zone', zoneItems]];
    this.zoneSets = bands.map(([k, its]) => ({ key: k, ids: its.map(t => t.node.id) }));
    this.zonePaths = {};
    bands.forEach(([k, its]) => { this.zonePaths[k] = this.plusesFor(its.map(t => this.P.get(t.node.id)), 3, k, R.pluses, its.map(t => t.node)); });
    this.zonePath = this.zonePaths.zone;
    return R;
  }
  place(n, x, y, depth, ctx) {
    const ov = this._ov;
    if (ov && ov.id === n.id && !ctx.unboxed) { x = ov.x; y = ov.y; }
    const m = this.M.get(n.id); const R = this._R; const K = this.K;
    const dragging = this._dset && this._dset.has(n.id);
    const z = (dragging ? 900 : 0) + (ctx.z != null ? ctx.z : depth * 20 + 4);
    if (m.pad && !ctx.unboxed) {
      const ty = this.typeOf(n);
      R.boxes.push({ id: n.id, x: x, y: y, w: m.w, h: m.h, neg: !!n.neg, inv: !!n.inv, night: ty.k === 'v' ? '#182654' : '#3B2C12', z: z - 1,
        anim: this._glow && this._glow.has(n.id) ? 'rgPulse 1.4s ease-in-out infinite' : 'none', down: this.onDown(n.id, 'bit'),
        aria: (n.neg ? 'Additive inverse' : 'Multiplicative inverse') + ' of a group. Drag the frame to move it' });
      this.M.set(n.id, m.inner);
      this.place(n, x + m.pad.x, y + m.pad.y, depth, Object.assign({}, ctx, { unboxed: true }));
      const io = (this.P.get(n.id) || {}).io;
      this.M.set(n.id, m);
      this.P.set(n.id, { x: x, y: y, w: m.w, h: m.h, depth: depth, io: io });
      return;
    }
    this.P.set(n.id, { x: x, y: y, w: m.w, h: m.h, depth: depth });
    if (n.t === 's') {
      const sl = this.slideOf(n.id);
      const lk = this.look(n);
      R.hexes.push({ id: n.id, tr: this.state.histAnim ? 'left 0.4s ease, top 0.4s ease' : 'none', x: x, y: y, dx: sl ? sl.x - x : 0, dy: sl ? sl.y - y : 0, face: lk.face, fg: lk.fg, lip: lk.lip, el: n.el, type: this.fieldSym(n.field), elSize: n.el.length > 3 ? 20 : 28,
        band: ctx.abstract ? 'repeating-linear-gradient(135deg, #F2B33D 0 6px, #DFA02A 6px 12px)' : '#F2B33D', sink: ctx.abstract ? 3 : 0,
        z: z + (sl && sl.top ? 60 : 0), scale: dragging ? 1.04 : 1, shadow: dragging ? 14 : 7, anim: sl ? 'zeroIn 0.4s ease-out' : this._glow && this._glow.has(n.id) ? 'rgPulse 1.4s ease-in-out infinite' : 'none', down: this.onDown(n.id, 'self'), aria: 'Scalar ' + n.el + ' in ' + this.fieldSym(n.field) });
      return;
    }
    if (n.t === 'v') {
      const holding = this.state.holding === n.id;
      const sl = this.slideOf(n.id);
      const lk = this.look(n); const et = this.elText(n);
      R.vecs.push({ id: n.id, tr: this.state.histAnim ? 'left 0.4s ease, top 0.4s ease' : 'none', x: x, y: y, w: n.w, type: n.type, el: et, elSize: et.length > 4 ? 21 : 27, face: lk.face, fg: lk.fg, lip: lk.lip,
        hasField: !!n.field, fLabel: this.fieldSym(n.field), pieceScale: holding ? 0.9 : 1, pieceBg: holding ? '#F7CD6E' : '#F2B33D',
        z: z + (sl && sl.top ? 60 : 0), scale: dragging ? 1.04 : 1, shadow: dragging ? 14 : 7, down: this.onDown(n.id, 'self'), pieceDown: this.onDown(n.id, 'strip'),
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
    this.plusesFor(n.terms.map(t => this.P.get(t.node.id)), gz + 1, n.id, R.pluses, n.terms.map(t => t.node));
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
    // Zeros. A 0 that's a term of a sum (in the expression, or inside a bracket) is in play: dropped on another term
    // of the same sum, it's absorbed (x + 0 = x). A 0 on its own outside any sum (the old tray's loose tile) adds
    // + 0 to what it's dropped on, like the tray pieces.
    const zn = loc.node;
    const isZero = (zn.t === 's' && zn.val === '0') || (zn.t === 'v' && zn.key === 'zero');
    if (isZero && role === 'self') {
      const inZone = loc.kind === 'top' && this.inZone(zn.id);
      if (loc.kind === 'term' || inZone) {
        const chain = loc.kind === 'term' ? loc.parent.terms.map(t => t.node.id) : this.zoneMates(zn.id).slice();
        d.absorb = { chain: chain.filter(x => x !== zn.id) };
      } else if (loc.kind === 'top') {
        const zt = this.typeOf(zn);
        d.zero = { kind: zt.k, f: zt.f, sp: zt.sp };
      }
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
    if (d.rules && role !== 'strip' && !d.absorb && !d.zero) this.setupCancel(d, loc);
    d.snap = this.readoutOf(this.state.tops); // the readout keeps showing this until the move is done
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
        if (Math.abs(dy) > Math.abs(dx)) { d.mode = 'move'; d.blockId = d.prodId; this.prepMove(d); d.cancel = null; d.absorbOne = null; this.setupCancel(d, null); }
        else d.mode = 'reorder';
      }
      if (d.mode === 'sand') this.detach(d);
      this.setState({ dragIds: this.dragSet(d), holding: null });
    }
    const pcx = d.gx + dx + d.gw / 2, pcy = d.gy + dy + d.gh / 2;
    d.zeroHover = d.zero ? this.zeroTarget(pcx, pcy, d.zero.kind, Object.assign({ exclude: d.id }, d.zero))
      : d.absorb ? this.absorbTarget(d, pcx, pcy)
      : d.absorbOne ? this.oneAbsorbTarget(d, pcx, pcy)
      : (d.zeroSmul && this.inRect(this.P.get(d.zeroSmul.vecId), pcx, pcy, -6)) ? { id: d.zeroSmul.prodId, glow: this.ids(this.locate(d.orig, d.zeroSmul.prodId).node), zs: true }
      : d.cancel ? this.cancelTarget(d, pcx, pcy) : null;
    if (d.mode === 'reorder' && d.zeroHover) {
      this.setState({ override: { id: d.id, x: d.gx + dx, y: d.gy + dy }, preview: null, zeroHover: d.zeroHover });
      return;
    }
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
    if (!d.moved) {
      this.setState({ holding: null, dragIds: null });
      if (!this.props.legacy && d.role === 'self') this.showTree(d.id);
      return;
    }
    if (this.state.zeroHover) this.setState({ zeroHover: null });
    if (d.zeroHover && (d.zeroHover.zs ? this.applyZeroSmul(d) : d.zeroHover.cancel ? this.applyCancel(d) : d.absorbOne ? this.absorbOne(d) : d.absorb ? this.absorbZero(d) : this.dropZero(d))) return;
    if (d.rules && d.preview) { this.applyPreview(d); return; }
    if (d.mode === 'reorder') { this._hint = ['mul_comm']; this.setState({ override: null, dragIds: null, preview: null }); return; }
    if (d.mode === 'move') {
      // on a hypothesis's board a term stays on its side of the =
      if (this.isHypWs(this.state.ws) && d.blockId) {
        const ZM = this.zm(); const side = (ts) => { const t = ts.find(u => u.node.id === d.blockId); if (!t) return null; const cy = t.y + this.measure(t.node).h / 2; return cy > this.K.ZT && cy < this.K.ZB ? (cy < ZM ? 'L' : 'R') : 'out'; };
        const was = side(d.orig), now = side(this.state.tops);
        if (was && now && was !== now) {
          this.setState({ tops: this.clone(d.orig), dragIds: null, preview: null, override: null });
          this.flash(this.P.get(d.blockId), 'a term stays on its side of the =', 'bad'); return;
        }
      }
      this.setState({ dragIds: null, preview: null }); return;
    }
    this.dropSand(d);
  }
  sig(n) {
    if (n.t === 's') return 's:' + n.field + ':' + n.val;
    if (n.t === 'v') return 'v:' + n.type + ':' + (n.neg ? '-' : '') + n.el + ':' + n.field;
    if (n.t === 'prod') return 'p(' + n.factors.map(f => this.sig(f)).join('*') + '|' + (n.vec ? this.sig(n.vec) : '') + ')';
    return 'g(' + n.terms.map(t => this.sig(t.node)).sort().join('+') + ')';
  }
  // a negated or inverted group is sealed: factoring sees it as one whole term, never reaching inside
  factorsOf(n) { if (this.flagged(n)) return this.typeOf(n).k === 's' ? [n] : []; return n.t === 'prod' ? n.factors : (this.typeOf(n).k === 's' ? [n] : []); }
  vecOf(n) { if (this.flagged(n)) return this.typeOf(n).k === 'v' ? n : null; return n.t === 'prod' ? n.vec : (this.typeOf(n).k === 'v' ? n : null); }
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
    else if (tl.kind === 'top' && this.inZone(T.id)) { const zi = this.zoneMates(T.id).slice(); terms = zi.map(id => (orig.find(t => t.node.id === id) || {}).node).filter(Boolean); cont = { type: 'zone', ids: zi }; }
    else return null;
    if (terms.length < 2) return null;
    const gsig = this.sig(loc.node); let hit = false;
    for (const U of terms) {
      if (U.id === T.id) continue;
      for (const f of this.factorsOf(U)) if (this.sig(f) === gsig && this.inRect(this.P.get(f.id), cx, cy, 6)) hit = true;
    }
    if (!hit) return null;
    // only the terms that really contain the factor group together; the rest (a lone 0, say) stay as they are
    const matches = {}; const glow = [];
    for (const U of terms) {
      const ids = this.matchSub(U, sub, U.id === T.id ? fixed : null);
      if (!ids) continue;
      matches[U.id] = ids; glow.push(...ids);
    }
    if (Object.keys(matches).length < 2) return null;
    return { type: 'collect', cont: cont, tid: T.id, subIds: fixed, matches: matches, glow: glow };
  }
  termsOf(orig, T) {
    const tl = this.locate(orig, T.id);
    if (tl.kind === 'term') return { terms: tl.parent.terms.map(t => t.node), cont: { type: 'sum', id: tl.parent.id } };
    if (tl.kind === 'top' && this.inZone(T.id)) { const zi = this.zoneMates(T.id).slice(); return { terms: zi.map(id => (orig.find(t => t.node.id === id) || {}).node).filter(Boolean), cont: { type: 'zone', ids: zi } }; }
    return null;
  }
  findVecPreview(orig, loc, cx, cy) {
    const v = loc.node;
    // collect: v dropped on an equal vector in another term  →  av + bv = (a + b)v
    const T = loc.kind === 'vec' ? loc.parent : loc.node;
    const tc = this.termsOf(orig, T); if (!tc || tc.terms.length < 2) return null;
    const vs = this.sig(v); let hit = false; const glow = []; const matched = [];
    for (const U of tc.terms) {
      const uv = this.vecOf(U);
      if (!uv || uv.t !== 'v' || this.sig(uv) !== vs) continue; // terms without this vector stay out of the grouping
      glow.push(uv.id); matched.push(U.id);
      if (U.id !== T.id && this.inRect(this.P.get(uv.id), cx, cy, 6)) hit = true;
    }
    if (!hit || matched.length < 2) return null;
    return { type: 'collectV', cont: tc.cont, tid: T.id, vid: v.id, glow: glow, matched: matched };
  }
  rowSum(terms) { const S = this.mkSum(terms); this.rowArrange(S); return S; }
  // Replace the terms of S that pass `pick` by one term made from them (make(terms)), where the first of them was;
  // the other terms stay. Then line S up in a row.
  groupIn(S, pick, make) {
    const ts = S.terms.filter(t => pick(t.node.id));
    const at = S.terms.indexOf(ts[0]);
    const grouped = { node: make(ts), x: ts[0].x, y: ts[0].y };
    S.terms = S.terms.filter(t => !pick(t.node.id));
    S.terms.splice(at, 0, grouped);
    this.rowArrange(S);
  }
  rowArrange(S) {
    let cur = 0;
    S.terms.forEach(t => { const m = this.measure(t.node); t.x = cur; t.y = -m.h / 2; cur += m.w + 52; });
  }
  // Factoring terms that aren't together at the front of their chain: Lean nests sums to the left, so the terms being
  // factored aren't one sub-expression and the law can't reach them. Lean first gets a rearranging step that brings
  // them together, bracketed, where the first of them was; then the law.
  leanPairUp(orig, pv) {
    const ids = pv.type === 'collectV' ? pv.matched : Object.keys(pv.matches || {});
    // the order as it was before the drag (the dragged term now sits on its target)
    let key, ents;
    if (pv.cont.type === 'sum') { const S = this.locate(orig, pv.cont.id).node; key = S.id; ents = S.terms; }
    else { key = this.zoneKeyOf(pv.cont.ids[0]) || 'zone'; ents = pv.cont.ids.map(id => orig.find(t => t.node.id === id)).filter(Boolean); }
    const order = ents.slice().sort((a, b) => Math.abs(a.y - b.y) > 60 ? a.y - b.y : a.x - b.x).map(t => t.node.id);
    if (ids.length < 2 || ids.length >= order.length) return;
    if (order.slice(0, ids.length).every(id => ids.indexOf(id) >= 0)) return; // already together at the front
    const together = order.filter(id => ids.indexOf(id) >= 0), rest = order.filter(id => ids.indexOf(id) < 0);
    const first = order.findIndex(id => ids.indexOf(id) >= 0);
    this._orderOverride = { key: key, ids: rest.slice(0, first).concat(together, rest.slice(first)) };
    this._leanGroup = { key: key, parts: [together] };
    this._leanMid = this.wsTree(); this._orderOverride = null; this._leanGroup = null;
  }
  applyPreview(d) {
    const pv = d.preview; const tops = this.clone(d.orig);
    if (pv.type === 'collect' || pv.type === 'collectV') this.leanPairUp(d.orig, pv);
    this._hint = pv.type === 'expandV' || pv.type === 'collectV' ? ['add_smul'] : ['smul_add', 'mul_add', 'add_mul'];
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
      const inV = id => pv.matched.indexOf(id) >= 0;
      if (pv.cont.type === 'sum' && !this.locate(tops, pv.cont.id).node.terms.every(t => inV(t.node.id))) {
        this.groupIn(this.locate(tops, pv.cont.id).node, inV, ts => this.mkProd([this.rowSum(ts.map(t => ({ node: coef(t.node), x: t.x, y: t.y })))], v0));
      } else if (pv.cont.type === 'sum') {
        const sl = this.locate(tops, pv.cont.id); const S = sl.node;
        const S2 = this.mkSum(S.terms.map(t => ({ node: coef(t.node), x: t.x, y: t.y })));
        this.rowArrange(S2);
        if (sl.kind === 'vec') { sl.parent.factors.push(S2); sl.parent.vec = v0; }
        else this.setRef(tops, sl, this.mkProd([S2], v0));
      } else {
        const zt = pv.cont.ids.map(id => tops.find(t => t.node.id === id)).filter(t => t && inV(t.node.id));
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
    const inM = id => !!pv.matches[id];
    if (pv.cont.type === 'sum' && !this.locate(tops, pv.cont.id).node.terms.every(t => inM(t.node.id))) {
      this.groupIn(this.locate(tops, pv.cont.id).node, inM, ts => {
        const M = this.rowSum(ts.map(t => ({ node: reduce(t.node, pv.matches[t.node.id]), x: t.x, y: t.y })));
        return this.typeOf(M).k === 'v' ? this.mkProd(sub, M) : this.mkProd(sub.concat([M]), null);
      });
    } else if (pv.cont.type === 'sum') {
      const sl = this.locate(tops, pv.cont.id); const S = sl.node;
      S.terms.forEach(t => { t.node = reduce(t.node, pv.matches[t.node.id] || []); });
      kind = this.typeOf(S).k;
      this.rowArrange(S);
      if (sl.kind === 'factor') sl.parent.factors.splice(sl.idx, 0, ...sub);
      else if (sl.kind === 'vec') sl.parent.factors.push(...sub);
      else this.setRef(tops, sl, kind === 'v' ? this.mkProd(sub, S) : this.mkProd(sub.concat([S]), null));
    } else {
      const zt = pv.cont.ids.map(id => tops.find(t => t.node.id === id)).filter(t => t && inM(t.node.id));
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
      if (this.state.rules && pc.kind !== 'zero' && pc.kind !== 'zeroS' && pc.kind !== 'one') return;
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
    if (d.id === 'PO') up.zeroHover = this.oneDropTarget(d.ox + w.dx + 48, d.oy + w.dy + 44);
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
  // Inverses. Dragging a term onto its additive twin in the same sum (x and −x), or a factor onto its multiplicative
  // twin in the same product (x and x⁻¹), turns the pair into 0 or 1. Either side can be a cluster: the pointer can be
  // over any tile of the matching run (direct match, no reordering: the player lines things up first).
  inverseAdd(n) {
    if (n.t === 's' || n.t === 'v') return this.negOf(n);
    const c = this.cloneFresh(n); c.neg = !c.neg; if (!c.neg) delete c.neg; return c;
  }
  inverseMul(n) {
    if (this.typeOf(n).k !== 's') return null;
    if (n.t === 's') { const c = this.mkProd([this.cloneFresh(n)], null); c.inv = true; return c; }
    const c = this.cloneFresh(n); c.inv = !c.inv; if (!c.inv) delete c.inv; return c;
  }
  // the run a cluster stands for inside a flattened chain: a sum's terms, a product's factors, or just itself
  runOf(x, kind) {
    if (kind === 'add' && x.t === 'sum' && !this.flagged(x)) return x.terms.map(t => t.node);
    if (kind === 'mul' && x.t === 'prod' && !this.flagged(x) && !x.vec) return x.factors;
    return [x];
  }
  setupCancel(d, loc) {
    if (d.mode === 'move') {
      const A = this.locate(d.tops, d.blockId); if (!A) return;
      let members, key;
      if (A.kind === 'term') { members = A.parent.terms.map(t => t.node); key = A.parent.id; }
      else if (A.kind === 'top' && this.inZone(A.node.id)) { const zi = this.zoneMates(A.node.id); members = d.tops.filter(t => zi.indexOf(t.node.id) >= 0).map(t => t.node); key = this.zoneKeyOf(A.node.id); }
      else return;
      const X = this.inverseAdd(A.node); if (!X) return;
      d.cancel = { kind: 'add', key: key, aId: A.node.id, chainIds: this.readingOrder(members, key).map(m => m.id), X: X };
    } else if (loc && loc.kind === 'factor') {
      const F = loc.node, P = loc.parent;
      if (F.t === 's' && F.val === '0' && P.vec && this.prog.done.indexOf('1.30') >= 0 && this.state.level !== '1.30') { d.zeroSmul = { prodId: P.id, vecId: P.vec.id }; }
      if (F.t === 's' && F.val === '1') { d.absorbOne = { prodId: P.id, chainIds: P.factors.filter(f => f.id !== F.id).map(f => f.id).concat(P.vec ? [P.vec.id] : []) }; return; }
      const X = this.inverseMul(F); if (!X) return;
      d.cancel = { kind: 'mul', key: P.id, aId: F.id, chainIds: P.factors.map(f => f.id), X: X };
    }
  }
  cancelTarget(d, cx, cy) {
    const L = d.cancel;
    const chain = L.chainIds.map(id => this.locate(d.orig, id)).filter(Boolean).map(l => l.node);
    let hit = -1;
    chain.forEach((m, i) => { if (m.id !== L.aId && this.inRect(this.P.get(m.id), cx, cy, -6)) hit = i; });
    if (hit < 0) return null;
    const run = this.runOf(L.X, L.kind); const k = run.length;
    for (let w = Math.max(0, hit - k + 1); w <= hit && w + k <= chain.length; w++) {
      const win = chain.slice(w, w + k);
      if (win.some(m => m.id === L.aId)) continue;
      if (!win.every((m, i) => this.canon(m) === this.canon(run[i]))) continue;
      if (L.kind === 'mul') { const e = this.evalN(this.mkProd(win.map(m => this.clone(m)), null)); if (!e || Math.hypot(e.c[0], e.c[1]) < 1e-12) continue; } // 0 has no inverse
      const glow = [].concat(...win.map(m => this.ids(m)));
      return { id: win[0].id, glow: glow, cancel: { ids: win.map(m => m.id) } };
    }
    return null;
  }
  applyCancel(d) {
    const L = d.cancel; const ids = d.zeroHover.cancel.ids;
    const tops = this.clone(d.orig);
    const A = this.locate(tops, L.aId); if (!A) return false;
    const ty = this.typeOf(A.node); const name = this.label(A.node);
    // for Lean: the same terms with A moved right after its twin (then the law applies to neighbours)
    const order = L.chainIds.filter(id => id !== L.aId); order.splice(order.indexOf(ids[ids.length - 1]) + 1, 0, L.aId);
    this._orderOverride = { key: L.key, ids: order }; this._leanGroup = { key: L.key, parts: [ids, [L.aId]] };
    this._leanMid = this.wsTree(); this._orderOverride = null; this._leanGroup = null;
    const res = L.kind === 'add' ? (ty.k === 'v' ? this.mkV(ty.sp, '0', 'zero', ty.f || null, this.K.ZW) : this.mkS(ty.f, '0', '0')) : this.mkS(ty.f, '1', '1');
    this.setRef(tops, this.locate(tops, ids[0]), res);
    ids.slice(1).concat([L.aId]).forEach(id => { const l = this.locate(tops, id); if (l) this.setRef(tops, l, null); });
    if (L.kind === 'add' && !this.isZoneKey(L.key)) {
      const sl = this.locate(tops, L.key);
      if (sl && sl.node.t === 'sum' && !this.flagged(sl.node) && sl.node.terms.length === 1) {
        if (sl.kind === 'top') tops[sl.ti].x += this.sumPadL(sl.node) + 26 + this.K.SPAD;
        this.setRef(tops, sl, sl.node.terms[0].node);
      }
    }
    this._hint = L.kind === 'add' ? ['add_neg_cancel'] : ['arith'];
    this.setState({ tops: this.normTops(tops), dragIds: null, preview: null, override: null });
    this.flash(this.P.get(ids[0]), L.kind === 'add' ? 'additive inverses · they make 0' : name + ' and its inverse make 1', 'ok');
    return true;
  }
  // 1.30, once won: the 0 of 0·𝑣 dropped on its vector makes the whole product the zero vector
  applyZeroSmul(d) {
    const tops = this.clone(d.orig); const l = this.locate(tops, d.zeroSmul.prodId); if (!l) return false;
    const ty = this.typeOf(l.node);
    this.setRef(tops, l, this.mkV(ty.sp, '0', 'zero', ty.f || null, this.K.ZW));
    this._hint = ['zero_smul'];
    this.setState({ tops: this.normTops(tops), dragIds: null, preview: null, override: null });
    this.flash(this.P.get(d.zeroSmul.prodId), '0𝑣 = 0 · 1.30', 'ok');
    return true;
  }
  // a 1 in a product, over another tile of the same product: 1·x = x
  oneAbsorbTarget(d, cx, cy) {
    for (const id of d.absorbOne.chainIds) {
      const l = this.locate(d.orig, id);
      if (l && this.inRect(this.P.get(id), cx, cy, -6)) return { id: id, glow: this.ids(l.node), one: true };
    }
    return null;
  }
  absorbOne(d) {
    const tops = this.clone(d.orig);
    const l = this.locate(tops, d.id); if (!l) return false;
    const at = this.P.get(d.zeroHover.id); const tl = this.locate(tops, d.zeroHover.id); const name = tl ? this.label(tl.node) : 'x';
    this.setRef(tops, l, null);
    this._hint = ['mul_one', 'one_smul'];
    this.setState({ tops: this.normTops(tops), dragIds: null, preview: null, override: null });
    this.flash(at, '1·' + name + ' = ' + name + ' · multiplicative identity', 'ok');
    return true;
  }
  // the tray's 1, dropped on a tile: a scalar x becomes x·1, a vector 𝑣 becomes 1·𝑣 (the 1 takes their field)
  oneDropTarget(cx, cy) {
    let best = null;
    this.state.tops.forEach(t => this.walk(t.node, n => {
      if (n.t !== 's' && n.t !== 'v') return;
      const p = this.P.get(n.id);
      if (this.inRect(p, cx, cy, 6) && (!best || p.depth >= best.depth)) best = { id: n.id, depth: p.depth, glow: [n.id], f: this.typeOf(n).f };
    }, null, null));
    return best;
  }
  addOne(tops, id) {
    const loc = this.locate(tops, id); if (!loc) return null;
    const X = loc.node; const one = this.mkS(this.typeOf(X).f || 'R', '1', '1');
    if (X.t === 's') { if (loc.kind === 'factor') loc.parent.factors.splice(loc.idx + 1, 0, one); else this.setRef(tops, loc, this.mkProd([X, one], null)); }
    else { if (loc.kind === 'vec') loc.parent.factors.push(one); else this.setRef(tops, loc, this.mkProd([one], X)); }
    return one;
  }
  // a scalar dragged from the tree onto a 1: 1 = x·x⁻¹ (not for x = 0)
  splitOne(tops, oneId, item) {
    const loc = this.locate(tops, oneId); if (!loc) return null;
    const a = this.cloneFresh(item); const b = this.inverseMul(item); if (!b) return null;
    const e = this.evalN(a); if (!e || e.k !== 's' || Math.hypot(e.c[0], e.c[1]) < 1e-12) return { bad: '0 has no multiplicative inverse' };
    if (loc.kind === 'factor') { loc.parent.factors.splice(loc.idx, 1, a, b); return { a: a, b: b, key: loc.parent.id, op: 'mul' }; }
    this.setRef(tops, loc, this.mkProd([a, b], null));
    return { a: a, b: b };
  }
  // The term of the 0's own sum under the pointer, if any (the whole term glows)
  absorbTarget(d, cx, cy) {
    for (const id of d.absorb.chain) {
      const loc = this.locate(d.orig, id); const p = this.P.get(id);
      if (loc && this.inRect(p, cx, cy, 6)) return { id: id, glow: this.ids(loc.node) };
    }
    return null;
  }
  // x + 0 = x: the 0 leaves its sum. A bracket left holding one term becomes that term.
  absorbZero(d) {
    const tops = this.clone(d.orig);
    const loc = this.locate(tops, d.id); const tl = this.locate(tops, d.zeroHover.id);
    if (!loc || !tl) return false;
    const name = this.label(tl.node); const at = this.P.get(d.zeroHover.id);
    if (loc.kind === 'term') {
      const S = loc.parent;
      S.terms.splice(loc.idx, 1);
      if (S.terms.length === 1) {
        const sl = this.locate(tops, S.id);
        if (sl.kind === 'top') tops[sl.ti].x += this.sumPadL(S) + 26 + this.K.SPAD;
        this.setRef(tops, sl, S.terms[0].node);
      }
    } else tops.splice(loc.ti, 1);
    this._hint = ['add_zero'];
    this.setState({ tops: this.normTops(tops), dragIds: null, preview: null, override: null });
    this.flash(at, name + ' + 0 = ' + name + ' · additive identity', 'ok');
    return true;
  }
  // a 0 tile released over a target: it leaves its spot and joins the target's sum
  dropZero(d) {
    const tops = this.clone(d.tops);
    const ti = tops.findIndex(t => t.node.id === d.id); if (ti < 0) return false;
    const from = tops[ti]; tops.splice(ti, 1);
    const tgt = this.locate(tops, d.zeroHover.id); if (!tgt) return false;
    const at = this.P.get(d.zeroHover.id);
    const z = this.addZero(tops, d.zeroHover.id, from.node); if (!z) return false;
    this._hint = ['add_zero'];
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
  exprText(nodes, top) { return this.exprTokens(nodes, top).map(k => k.t).join(''); }
  // The same, as tokens {t, id}: each piece of text knows the node it came from (brackets, + and · belong to their
  // sum or product), so the readout can light up the part of the expression being moved.
  exprTokens(nodes, top) {
    const join = (lists, sep, id) => lists.reduce((out, l, i) => out.concat(i ? [{ t: sep, id: id }] : [], l), []);
    // a sum: terms in reading order, + between them, − before a negative cluster (its own − then goes)
    const chain = (ns, id, key) => {
      const out = [];
      this.readingOrder(ns, key).forEach((x, i) => {
        let tk = one(x);
        if (i > 0) {
          if (this.negCluster(x)) { tk = tk.slice(); tk[0] = Object.assign({}, tk[0], { t: tk[0].t.replace(/^−/, '') }); if (!tk[0].t) tk.shift(); out.push({ t: ' − ', id: x.id }); }
          else out.push({ t: ' + ', id: id });
        }
        out.push(...tk);
      });
      return out;
    };
    const one = n => {
      if (n.t === 's' || n.t === 'v') return [{ t: this.elText(n), id: n.id }];
      let core;
      if (n.t === 'sum') core = [{ t: '(', id: n.id }].concat(chain(n.terms.map(t => t.node), n.id, n.id), [{ t: ')', id: n.id }]);
      else { const fs = join(n.factors.map(one), '·', n.id); core = n.vec ? fs.concat(one(n.vec)) : fs; }
      if (!this.flagged(n)) return core;
      if (n.t === 'prod') core = [{ t: '(', id: n.id }].concat(core, [{ t: ')', id: n.id }]);
      return (n.neg ? [{ t: '−', id: n.id }] : []).concat(core, n.inv ? [{ t: '⁻¹', id: n.id }] : []);
    };
    const parts = chain(nodes, null, 'zone');
    return top ? parts : [{ t: '(', id: null }].concat(parts, [{ t: ')', id: null }]);
  }
  // The readout of the expression as it stands: its tokens, whether its terms can be added, and its value
  readoutOf(tops) {
    if (this.isHypWs(this.state.ws)) {
      // a hypothesis: its two sides, = between; each side all one type, and the same type on both
      const side = key => { const z = (this.zoneSets || []).find(x => x.key === key); return z ? this.readingOrder(z.ids.map(id => (tops.find(t => t.node.id === id) || {}).node).filter(Boolean), key) : []; };
      const L = side('zone'), Rr = side('zoneR'); if (!L.length && !Rr.length) return null;
      const ty = ns => { const ts = ns.map(n => this.typeOf(n)); return ts.length && ts.every(t => (t.k === 's' || t.k === 'v') && t.k === ts[0].k && (t.k === 's' ? t.f === ts[0].f : t.sp === ts[0].sp)) ? ts[0] : null; };
      const a = ty(L), b = ty(Rr);
      return { tokens: this.exprTokens(L, true).concat([{ t: ' = ', id: null }], this.exprTokens(Rr, true)), ok: !!(a && b && a.k === b.k), val: null, eq: true };
    }
    const zoneTops = tops.filter(t => this.zoneIds.indexOf(t.node.id) >= 0);
    if (!zoneTops.length) return null;
    const types = zoneTops.map(t => this.typeOf(t.node));
    let ok = types.every(t => t.k === 's' || t.k === 'v');
    ok = ok && types.every(t => t.k === types[0].k && (t.k === 's' ? t.f === types[0].f : t.sp === types[0].sp));
    let val = null;
    if (ok) { for (const t of zoneTops) { const e = this.evalN(t.node); if (!e) { val = null; break; } val = val ? this.addE(val, e) : e; if (!val) break; } }
    return { tokens: this.exprTokens(zoneTops.map(t => t.node), true), ok: !!(ok && val), val: ok ? val : null };
  }
  slideOf(id) {
    const St = this.state;
    if (St.slide && St.slide.id === id) return St.slide;
    return St.slides && St.slides[id] || null;
  }
  // The additive inverse of a tile (a fresh copy): 2 ↔ −2, 𝑣 ↔ −𝑣. A 0 is its own inverse: null.
  negOf(n) {
    const c = this.cloneFresh(n);
    if (c.t === 's') {
      if (c.val === '0') return null;
      const neg = String(c.val).charAt(0) === '-';
      c.val = neg ? String(c.val).slice(1) : '-' + c.val; c.el = neg ? c.el.replace(/^−/, '') : '−' + c.el;
    } else if (c.t === 'v') { if (c.key === 'zero') return null; c.neg = !c.neg; }
    else return null;
    return c;
  }
  // A tile's identity for matching, ignoring ids and field strips: two 0s in 𝑉 are the same whatever their edge says
  canon(n) {
    if (n.t === 's') return 's:' + n.val;
    if (n.t === 'v') return 'v:' + n.type + ':' + (n.neg ? '-' : '') + n.el;
    const core = n.t === 'prod' ? 'p(' + n.factors.map(f => this.canon(f)).join('*') + '|' + (n.vec ? this.canon(n.vec) : '') + ')'
      : 'g(' + n.terms.map(t => this.canon(t.node)).sort().join('+') + ')';
    return (n.neg ? '-' : '') + core + (n.inv ? '^-1' : '');
  }
  // The level's declared variables as tiles (scalars, then vectors, then the witnesses' 𝑤ₖ), the same ones as in
  // ASSUMPTIONS; kept while the declarations don't change so the tray's tiles keep their ids
  varItems() {
    const St = this.state; if (this.props.legacy || this.props.demo) return [];
    const wits = (St.hyps || []).filter(h => h.wit).map(h => h.lhs[h.lhs.length - 1]);
    const vars = (St.vars || [['𝑣', 'v']]).concat(wits.map(w => [w.el, w.key]));
    const sig = JSON.stringify([St.scalars || [], vars]);
    if (this._vars && this._vars.sig === sig) return this._vars.list;
    const ascii = el => { const c = el.codePointAt(0); return c >= 0x1D44E && c <= 0x1D467 ? String.fromCharCode(97 + c - 0x1D44E) : el === 'ℎ' ? 'h' : el; };
    const list = (St.scalars || []).map(([el, f, key]) => this.mkS(f === 'ℂ' ? 'C' : 'R', el, key || ascii(el)))
      .concat(vars.map(([el, key]) => this.mkV('𝑉', el, key, 'R', 140)));
    this._vars = { sig: sig, list: list };
    return list;
  }
  // Tap: the tile and its inverse join the tray (once each), which opens; new ones pop in
  toTray(n) {
    const have = new Set((this.state.trayItems || []).map(it => this.canon(it.node)));
    const add = [this.cloneFresh(n), this.negOf(n)].filter(x => x && !have.has(this.canon(x)));
    if (!add.length) { this.setState({ trayOpen: true, trayTab: 'tray' }); return; }
    const items = add.map(x => ({ id: this.nid('T'), node: x }));
    const fresh = {}; items.forEach((it, i) => { fresh[it.id] = i * 0.12; });
    this.setState({ trayItems: (this.state.trayItems || []).concat(items), trayOpen: true, trayTab: 'tray', trayNew: fresh });
    clearTimeout(this._tn);
    this._tn = setTimeout(() => this.setState({ trayNew: {} }), 1200);
  }
  // A tray item over a 0 of its own type in play (a scalar over a 0 in its field, a vector over a 0 in its space)
  splitTarget(item, cx, cy) {
    const it = this.typeOf(item);
    let best = null;
    this.state.tops.forEach(t => this.walk(t.node, n => {
      const isZero = (n.t === 's' && n.val === '0') || (n.t === 'v' && n.key === 'zero');
      const isOne = n.t === 's' && n.val === '1' && it.k === 's';
      if (!isZero && !isOne) return;
      const nt = this.typeOf(n);
      if (nt.k !== it.k) return;
      if (nt.k === 's' && nt.f && it.f && nt.f !== it.f) return;
      if (nt.k === 'v' && nt.sp !== it.sp) return;
      const p = this.P.get(n.id);
      if (this.inRect(p, cx, cy, 6) && (!best || p.depth >= best.depth)) best = { id: n.id, depth: p.depth, glow: [n.id], one: isOne };
    }, null, null));
    return best;
  }
  // 0 = x + (−x) (Axler 1.20, additive inverse, read right to left): the 0 becomes x with −x right after it, in the
  // same sum; a 0 that isn't a term of a sum (a scalar docked on a vector, say) becomes the bracket (x + −x).
  splitZero(tops, zeroId, item, given) {
    const loc = this.locate(tops, zeroId); if (!loc) return null;
    const Z = loc.node; const a = this.cloneFresh(item); const b = given || this.inverseAdd(item); if (!b) return null;
    const K = this.K; const ma = this.measure(a), mb = this.measure(b), mz = this.measure(Z);
    const two = (list, t, inSame) => {
      const grow = ma.w + K.GAP + mb.w - mz.w;
      list.forEach(u => { if (u !== t && inSame(u) && u.x >= t.x + mz.w - 1) u.x += grow; });
      list.splice(list.indexOf(t), 1, { node: a, x: t.x, y: t.y + mz.h / 2 - ma.h / 2 }, { node: b, x: t.x + ma.w + K.GAP, y: t.y + mz.h / 2 - mb.h / 2 });
    };
    let key = null;
    if (loc.kind === 'term') { key = loc.parent.id; two(loc.parent.terms, loc.parent.terms[loc.idx], () => true); }
    else if (loc.kind === 'top' && this.inZone(Z.id)) { const zi = this.zoneMates(Z.id); key = this.zoneKeyOf(Z.id); two(tops, tops[loc.ti], u => zi.indexOf(u.node.id) >= 0); }
    else {
      const S = this.mkSum([{ node: a, x: 0, y: 0 }, { node: b, x: 0, y: 0 }]); this.rowArrange(S);
      if (loc.kind === 'top') tops[loc.ti].x -= this.sumPadL(S) + 26 + K.SPAD;
      this.setRef(tops, loc, S);
    }
    return { a: a, b: b, key: key, op: 'add' };
  }
  // ---------- hypotheses (a level's h : l = r): drag the card onto a run matching either side; it becomes the other ----------
  // the sum (or the expression) a tile belongs to, and its term there: the deepest bracket holding it, else the expression
  memberOf(tops, id) {
    let best = null;
    tops.forEach(t => this.walk(t.node, n => {
      if (n.t !== 'sum' || this.flagged(n)) return;
      n.terms.forEach(u => { if (this.ids(u.node).indexOf(id) >= 0) { const d = (this.P.get(n.id) || {}).depth || 0; if (!best || d >= best.d) best = { d: d, key: n.id, member: u.node, list: n.terms.map(x => x.node) }; } });
    }, null, null));
    if (best) return best;
    const zt = tops.find(t => this.inZone(t.node.id) && this.ids(t.node).indexOf(id) >= 0);
    if (!zt) return null;
    const zi = this.zoneMates(zt.node.id);
    return { key: this.zoneKeyOf(zt.node.id), member: zt.node, list: tops.filter(t => zi.indexOf(t.node.id) >= 0).map(t => t.node) };
  }
  hypTarget(h, cx, cy) {
    let tile = null;
    this.state.tops.forEach(t => this.walk(t.node, n => {
      if (n.t !== 's' && n.t !== 'v') return; const p = this.P.get(n.id);
      if (this.inRect(p, cx, cy, 4) && (!tile || p.depth >= tile.depth)) tile = { id: n.id, depth: p.depth };
    }, null, null));
    if (!tile) return null;
    const m = this.memberOf(this.state.tops, tile.id); if (!m) return null;
    const chain = this.readingOrder(m.list, m.key); const at = chain.findIndex(x => x.id === m.member.id);
    for (const [side, other, dir] of [[h.lhs, h.rhs, 'fwd'], [h.rhs, h.lhs, 'back']]) {
      const k = side.length;
      for (let w = Math.max(0, at - k + 1); w <= at && w + k <= chain.length; w++) {
        const win = chain.slice(w, w + k);
        // a ∀ hypothesis's bound variable (pat) matches any vector term, the same one wherever it appears
        let bound = null;
        const ok = win.every((x, i) => {
          if (!side[i].pat) return this.canon(x) === this.canon(side[i]);
          if (this.typeOf(x).k !== 'v') return false;
          if (bound) return this.canon(x) === this.canon(bound);
          bound = x; return true;
        });
        if (ok) {
          const to = other.map(n => n.pat ? (bound ? this.clone(bound) : n) : n);
          return { id: win[0].id, glow: [].concat(...win.map(x => this.ids(x))), hyp: { key: m.key, ids: win.map(x => x.id), to: to, from: win.map(x => this.clone(x)), dir: dir, name: h.name, label: h.label } };
        }
      }
    }
    return null;
  }
  applyHyp(hit) {
    const H = hit.hyp; const tops = this.clone(this.state.tops);
    const list = this.isZoneKey(H.key) ? tops : this.locate(tops, H.key).node.terms;
    const zi = this.zoneMates(H.ids[0]);
    const inChain = this.isZoneKey(H.key) ? (t => zi.indexOf(t.node.id) >= 0) : (() => true);
    const ents = H.ids.map(id => list.find(t => t.node.id === id));
    const first = ents[0]; const i0 = list.indexOf(first);
    const oldW = ents.reduce((a, t) => a + this.measure(t.node).w, 0) + this.K.GAP * (ents.length - 1);
    const right = Math.max(...ents.map(t => t.x + this.measure(t.node).w));
    const cy = first.y + this.measure(first.node).h / 2;
    if (H.ids.length > 1) { this._leanGroup = { key: H.key, parts: [H.ids] }; this._leanMid = this.wsTree(); this._leanGroup = null; }
    const fresh = H.to.map(n => this.cloneFresh(n));
    let x = first.x;
    const added = fresh.map(n => { const m = this.measure(n); const e = { node: n, x: x, y: cy - m.h / 2 }; x += m.w + this.K.GAP; return e; });
    const newW = x - this.K.GAP - first.x;
    list.forEach(t => { if (ents.indexOf(t) < 0 && inChain(t) && t.x >= right - 1) t.x += newW - oldW; });
    ents.forEach(t => list.splice(list.indexOf(t), 1));
    list.splice(Math.min(i0, list.length), 0, ...added);
    if (fresh.length > 1) this._splitGroup = { key: H.key, parts: [fresh.map(n => n.id)] };
    this._hint = [H.name];
    this.setState({ tops: this.normTops(tops) });
    const side = ns => ns.map(n => this.label(n)).join(' + ');
    this.flash(this.P.get(H.ids[0]), H.label + ': ' + side(H.dir === 'fwd' ? H.from : H.to) + ' = ' + side(H.dir === 'fwd' ? H.to : H.from), 'ok');
  }
  // a hypothesis dragged straight from ASSUMPTIONS (a tap still switches the tiles there)
  hypDown(h, text) {
    return e => {
      if (e && e.stopPropagation) e.stopPropagation();
      const f = this.fingerAt(e);
      this.hdrag = { hyp: h, sx: e.clientX, sy: e.clientY, fx: f.x, fy: f.y, x: f.x, y: f.y, moved: false, text: text.replace(/^\(|\)$/g, ''), quiet: true };
    };
  }
  hmove(e) {
    const d = this.hdrag; const w = this.worldDelta(e, d);
    if (!d.moved && Math.abs(w.dx) + Math.abs(w.dy) < 8) return;
    d.moved = true; d.x = d.fx + w.dx; d.y = d.fy + w.dy;
    this.setState({ zeroHover: this.hypTarget(d.hyp, d.x, d.y), hdragAt: { x: d.x, y: d.y } });
  }
  hend() {
    const d = this.hdrag; this.hdrag = null;
    const hit = d.moved ? this.state.zeroHover : null;
    this.setState({ zeroHover: null, hdragAt: null });
    if (!d.moved && d.quiet) return;
    if (!d.moved) { this.flash({ x: 40, y: this.K.ZT }, 'Drag ' + d.hyp.label + ' onto either side of it on the board: that part becomes the other side', 'info'); return; }
    if (hit && hit.hyp) this.applyHyp(hit);
  }
  // a pointer event's position in board units
  fingerAt(e) {
    const U = this.unit(); const S = U.u * this.scaleNow();
    return { x: (e.clientX - U.l) / S - this.state.panX, y: (e.clientY - U.t) / S - this.state.panY };
  }
  // A tree piece or tray item follows the finger (centred on it), and what it would split is whatever 0 (or 1) of
  // its type is under the finger: the piece's type is known as a whole, so which part of it overlaps doesn't matter
  imove(e) {
    const d = this.idrag; const w = this.worldDelta(e, d);
    if (!d.moved && Math.abs(w.dx) + Math.abs(w.dy) < 8) return;
    d.moved = true;
    const fx = d.fx + w.dx, fy = d.fy + w.dy;
    const m = this.measure(d.node);
    d.x = fx - m.w / 2; d.y = fy - m.h / 2;
    this.setState({ zeroHover: this.splitTarget(d.node, fx, fy), idragAt: { x: d.x, y: d.y } });
  }
  iend() {
    const d = this.idrag; this.idrag = null;
    if (!d.moved && d.tap) { d.tap(); return; }
    const hit = d.moved ? this.state.zeroHover : null;
    this.setState({ zeroHover: null, idragAt: null });
    if (!d.moved) { this.flash({ x: 40, y: this.K.ZT }, 'Drag it onto a 0 of the same type to split the 0 into it and its inverse', 'info'); return; }
    if (!hit) return;
    const tops = this.clone(this.state.tops);
    const at = this.P.get(hit.id);
    const isVec = this.typeOf(d.node).k === 'v';
    if (isVec && !hit.one && !d.node.wit && !this.has127()) { this.flash(at, '−𝑥 needs 1.27 first · use the inverse axiom instead: tap the node until it shows ∃𝑤', 'bad'); return; }
    let r, wHyp = null;
    if (d.node.wit) {
      // the inverse axiom (1.20): some 𝑤ₖ with 𝑥 + 𝑤ₖ = 0, a new vector and a new hypothesis
      const x = this.cloneFresh(d.node); this.walk(x, m => { delete m.wit; }, null, null);
      const hy = this.state.hyps || []; const k = hy.filter(h => h.wit).length + 1; const sub = '₀₁₂₃₄₅₆₇₈₉'.charAt(k);
      const zt = this.typeOf(this.locate(tops, hit.id).node);
      const w = this.mkV(zt.sp, '𝑤' + sub, 'y' + k, zt.f || null, 120);
      const hname = 'h' + (hy.filter(h => !h.wit).length + k);
      r = this.splitZero(tops, hit.id, x, w); if (!r) return;
      wHyp = { name: hname, label: 'h' + sub, lhs: [this.clone(r.a), this.clone(w)], rhs: [this.mkV(zt.sp, '0', 'zero', zt.f || null, 110)], wit: true };
      this._witness = { x: this.leanTree(r.a), name: 'y' + k, h: hname };
    } else r = hit.one ? this.splitOne(tops, hit.id, d.node) : this.splitZero(tops, hit.id, d.node);
    if (!r) return;
    if (r.bad) { this.flash(at, r.bad, 'bad'); return; }
    const slides = {}; slides[r.a.id] = { x: d.x, y: d.y, top: true }; slides[r.b.id] = { x: d.x, y: d.y };
    this._hint = hit.one ? ['arith'] : wHyp ? [wHyp.name] : ['add_neg_cancel'];
    if (r.key) this._splitGroup = { key: r.key, parts: [[r.a.id], [r.b.id]] };
    let newHyps = null;
    if (wHyp) {
      // the witness gets its own ASSUMPTIONS line: GOAL, EXPRESSION and the board's tiles (and the slide-in) move down by it
      newHyps = (this.state.hyps || []).concat([wHyp]);
      const before = this.K.ZT; this.relayout(newHyps, tops); const d = this.K.ZT - before;
      Object.keys(slides).forEach(k => { slides[k].y += d; });
    }
    this.setState(Object.assign({ tops: this.normTops(tops), slides: slides }, newHyps ? { hyps: newHyps } : {}));
    clearTimeout(this._ss);
    this._ss = setTimeout(() => this.setState({ slides: {} }), 650);
    const a = this.label(r.a), b = this.label(r.b);
    this.flash(at, hit.one ? '1 = ' + a + '·' + b + ' · multiplicative inverse' : wHyp ? 'inverse axiom: some ' + b + ' with ' + a + ' + ' + b + ' = 0 (' + wHyp.label + ')' : '0 = ' + a + ' + ' + b + ' · additive inverse', 'ok');
  }
  // a short text form of a term, for messages: −1·𝑣, (2 + 3)·𝑣
  label(n) {
    if (n.t === 's' || n.t === 'v') return this.elText(n);
    if (this.flagged(n)) return (n.neg ? '−' : '') + '(' + this.label(Object.assign({}, n, { neg: false, inv: false })) + ')' + (n.inv ? '⁻¹' : '');
    if (n.t === 'prod') return n.factors.map(f => this.label(f)).concat(n.vec ? [this.label(n.vec)] : []).join('·');
    return '(' + n.terms.map(t => this.label(t.node)).join(' + ') + ')';
  }
  // v  ->  v + 0 (Axler 1.20, additive identity, read right to left), and a  ->  a + 0 for scalars (the field's).
  // The 0 always stays in its target's row, even past the board's edge (the board scrolls); rows are the player's
  // to arrange. The 0 lands just right of its target, in the
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
    if (loc.kind === 'top' && this.inZone(X.id)) { const zi = this.zoneMates(X.id); beside(tops, tops[loc.ti], u => zi.indexOf(u.node.id) >= 0); return z; }
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
    if (pc.kind === 'one') {
      const hit = d.moved ? this.state.zeroHover : null;
      this.setState({ pieces: home, zeroHover: null });
      if (!d.moved) { this.flash({ x: 40, y: this.K.ZT }, 'Drag the 1 onto a tile: a scalar x becomes x·1, a vector 𝑣 becomes 1·𝑣', 'info'); return; }
      if (!hit) return;
      const at = this.P.get(hit.id); const tgt = this.locate(tops, hit.id).node; const name = this.label(tgt);
      const one = this.addOne(tops, hit.id); if (!one) return;
      this._hint = ['mul_one', 'one_smul'];
      this.setState({ tops: this.normTops(tops), slide: { id: one.id, x: pc.x, y: pc.y } });
      clearTimeout(this._st);
      this._st = setTimeout(() => this.setState({ slide: null }), 450);
      this.flash(at, name + ' = ' + (tgt.t === 'v' ? '1·' + name : name + '·1') + ' · multiplicative identity', 'ok');
      return;
    }
    if (pc.kind === 'zero' || pc.kind === 'zeroS') {
      const hit = d.moved ? this.state.zeroHover : null;
      this.setState({ pieces: home, zeroHover: null });
      if (!d.moved) { this.flash({ x: pc.hx, y: pc.hy }, pc.kind === 'zero' ? 'Drag the 0 onto a vector, or a vector sum’s right bracket' : 'Drag the 0 onto a scalar, or a scalar sum’s right bracket', 'info'); return; }
      if (!hit) return;
      const at = this.P.get(hit.id); const tgt = this.locate(tops, hit.id).node;
      const z = this.addZero(tops, hit.id); if (!z) return;
      this._hint = ['add_zero'];
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
  // Double-tapping a + lines its terms up in one row, in the order the plus signs join them, starting from the
  // leftmost end. The row keeps the first tile's height and left edge (so it stays where it was), and in the
  // expression never rises into the heading and readout above it. The tiles glide into place.
  arrange(gid) {
    const tops = this.clone(this.state.tops);
    const lineUp = (slots, boxes, order, minCy) => {
      if (order.length && boxes[order[0]].x > boxes[order[order.length - 1]].x) order = order.slice().reverse();
      const first = boxes[order[0]];
      const hMax = Math.max(...order.map(i => boxes[i].h));
      const cy = Math.max(first.y + first.h / 2, minCy + hMax / 2);
      let cur = slots[order[0]].x;
      order.forEach(i => { slots[i].x = cur; slots[i].y = cy - boxes[i].h / 2; cur += boxes[i].w + this.K.GAP; });
    };
    if (this.isZoneKey(gid)) {
      const zs = (this.zoneSets || []).find(z => z.key === gid); if (!zs) return;
      const items = zs.ids.map(id => tops.find(t => t.node.id === id)).filter(Boolean);
      const boxes = items.map(t => this.P.get(t.node.id));
      // slots and boxes in the same (world) units; the row's top stays below the readout (a hypothesis's second
      // row, below the split)
      lineUp(items, items.map((t, i) => ({ x: t.x, y: t.y, w: boxes[i].w, h: boxes[i].h })), (this.zonePaths[gid] || []).slice(), gid === 'zoneR' ? this.zm() + 6 : this.K.ZT + 104);
    } else {
      const loc = this.locate(tops, gid); if (!loc) return;
      const S = loc.node;
      const bx = S.terms.map(t => this.P.get(t.node.id));
      const path = this.bestPath(bx.map(p => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })), bx);
      // inside a bracket the terms' own coordinates are relative to it
      lineUp(S.terms, S.terms.map((t, i) => ({ x: t.x, y: t.y, w: bx[i].w, h: bx[i].h })), path, -1e9);
    }
    this.setState({ tops: tops, histAnim: true });
    clearTimeout(this._ha); this._ha = setTimeout(() => this.setState({ histAnim: false }), 450);
  }
  flash(at, text, kind) {
    const f = { x: Math.max(12, Math.min((at && at.x || 40) - 40, 200)), y: Math.max(120, (at && at.y || 200) - 50), text: text, kind: kind };
    this.setState({ flash: f });
    clearTimeout(this._ft);
    this._ft = setTimeout(() => this.setState({ flash: null }), 2000);
  }

  // ---------- the expression tree (tray): tap a tile on the board to see its cluster as a tree ----------
  showTree(id) {
    const loc = this.locate(this.state.tops, id); if (!loc) return;
    const root = this.state.tops[loc.ti].node;
    this.setState({ tree: { root: this.cloneFresh(root) }, treeLeaving: [], trayOpen: true, trayTab: 'tray' });
  }
  treeFind(root, id) { let f = null; this.walk(root, n => { if (n.id === id) f = n; }, null, null); return f; }
  // Tap a leaf: it becomes its night tile (and back). Tap an operator: on vectors, toggle −(…); on scalars, cycle
  // −(…) → −(…)⁻¹ → (…)⁻¹ → plain. Only the tree's copy changes: drag pieces out to use them.
  // −𝑣 is notation that 1.28 introduces once inverses are known to be unique (1.27): before that level is won,
  // vectors have no − in the tree, only the inverse axiom's witness (∃𝑤: some 𝑤 with 𝑥 + 𝑤 = 0)
  has127() { return this.props.legacy || this.prog.done.indexOf('1.27') >= 0; }
  treeTap(id) {
    const before = this.treeVals(this.state.tree.root);
    const t = this.clone(this.state.tree); const n = this.treeFind(t.root, id); if (!n) return;
    // a toggle: before 1.27 the existence bubble (∃𝑤), after it the minus that replaces it (that's what 1.27 buys)
    const vecCycle = () => {
      const k = this.has127() ? 'neg' : 'wit';
      delete n[k === 'neg' ? 'wit' : 'neg'];
      if (n[k]) delete n[k]; else n[k] = true;
    };
    if (n.t === 's') { if (n.val === '0') return; const neg = String(n.val).charAt(0) === '-'; n.val = neg ? String(n.val).slice(1) : '-' + n.val; n.el = neg ? n.el.replace(/^−/, '') : '−' + n.el; }
    else if (n.t === 'v') { if (n.key === 'zero') return; vecCycle(); }
    else if (this.typeOf(n).k === 'v') vecCycle();
    else {
      if (!n.neg && !n.inv) n.neg = true; else if (n.neg && !n.inv) n.inv = true; else if (n.neg && n.inv) delete n.neg; else delete n.inv;
    }
    // what disappears (a − node, a ⁻¹ node, the box) pops out where it was
    const after = this.treeVals(t.root); const keep = new Set(after.wraps.map(w => w.key).concat(after.boxes.map(b => b.key)));
    const leaving = before.wraps.filter(w => !keep.has(w.key)).map(w => Object.assign({ wrap: true }, w))
      .concat(before.boxes.filter(b => !keep.has(b.key)).map(b => Object.assign({ box: true }, b)));
    this.setState({ tree: t, treeLeaving: leaving });
    clearTimeout(this._tl);
    if (leaving.length) this._tl = setTimeout(() => this.setState({ treeLeaving: [] }), 380);
  }
  // Layout: leaves (half-size tiles) along the bottom of each branch, operators as circles above their children.
  // A cluster's − and ⁻¹ sit on the edge going up from its operator (one in the middle, two at thirds), and a box
  // surrounds the subtree: night for −, a gold outline for ⁻¹ alone.
  treeVals(root) {
    const LEVEL = 96, TOP = 78, R0 = 17, GAP = 14;
    const leaf = n => n.t === 's' || n.t === 'v';
    const kids = n => n.t === 'prod' ? n.factors.concat(n.vec ? [n.vec] : []) : n.t === 'sum' ? n.terms.map(t => t.node) : [];
    const leafW = n => n.t === 'v' ? n.w / 2 : 48;
    const width = new Map();
    const W = n => { const w = leaf(n) ? leafW(n) + GAP : Math.max(2 * R0 + GAP, kids(n).reduce((a, k) => a + W(k), 0)); width.set(n.id, w); return w; };
    W(root);
    const out = { nodes: [], edges: [], wraps: [], boxes: [] }; const pos = new Map(); let depthMax = 0;
    const put = (n, x0, depth) => {
      const w = width.get(n.id), cx = x0 + w / 2, cy = TOP + depth * LEVEL; depthMax = Math.max(depthMax, depth);
      pos.set(n.id, { cx: cx, cy: cy, top: leaf(n) ? cy - 22 : cy - R0, bot: leaf(n) ? cy + 22 : cy + R0 });
      if (leaf(n)) { out.nodes.push({ key: n.id, kind: 'leaf', node: n, x: cx - leafW(n) / 2, y: cy - 22, w: leafW(n), h: 44 }); return; }
      out.nodes.push({ key: n.id, kind: 'op', node: n, x: cx - R0, y: cy - R0, w: 2 * R0, h: 2 * R0, sym: n.t === 'prod' ? '·' : '+' });
      let x = x0; kids(n).forEach(k => { put(k, x, depth + 1); x += width.get(k.id); });
    };
    put(root, 0, 0);
    const sub = n => { const ids = []; this.walk(n, m => ids.push(m.id), null, null); return ids; };
    const edges = (n, parent) => {
      const p = pos.get(n.id); const q = parent ? pos.get(parent.id) : null;
      const y2 = q ? q.bot : p.top - LEVEL + 22;
      if (q || this.flagged(n) || n.wit) out.edges.push({ x1: p.cx, y1: p.top, x2: q ? q.cx : p.cx, y2: y2 });
      if (n.wit) {
        const x2 = q ? q.cx : p.cx;
        out.wraps.push({ key: n.id + ':wit', kind: 'wit', op: n.id, x: p.cx + (x2 - p.cx) / 2 - 104, y: p.top + (y2 - p.top) / 2 - 16 });
        const ids = new Set(sub(n)); const ns = out.nodes.filter(m => ids.has(m.key));
        const x0 = Math.min(...ns.map(m => m.x)), x1 = Math.max(...ns.map(m => m.x + m.w)), y0 = Math.min(...ns.map(m => m.y)), y1 = Math.max(...ns.map(m => m.y + m.h));
        out.boxes.push({ key: n.id + ':box', x: x0 - 9, y: y0 - 9, w: x1 - x0 + 18, h: y1 - y0 + 18, wit: true });
      }
      if (this.flagged(n)) {
        const x2 = q ? q.cx : p.cx;
        const slots = n.neg && n.inv ? [['inv', 1 / 3], ['neg', 2 / 3]] : [[n.neg ? 'neg' : 'inv', 1 / 2]];
        slots.forEach(([k, t]) => out.wraps.push({ key: n.id + ':' + k, kind: k, op: n.id, x: p.cx + (x2 - p.cx) * t - R0, y: p.top + (y2 - p.top) * t - R0, night: this.typeOf(n).k === 'v' ? '#182654' : '#3B2C12' }));
        const ids = new Set(sub(n)); const ns = out.nodes.filter(m => ids.has(m.key));
        const x0 = Math.min(...ns.map(m => m.x)), x1 = Math.max(...ns.map(m => m.x + m.w)), y0 = Math.min(...ns.map(m => m.y)), y1 = Math.max(...ns.map(m => m.y + m.h));
        out.boxes.push({ key: n.id + ':box', x: x0 - 9, y: y0 - 9, w: x1 - x0 + 18, h: y1 - y0 + 18, neg: !!n.neg, inv: !!n.inv, night: this.typeOf(n).k === 'v' ? '#182654' : '#3B2C12' });
      }
      kids(n).forEach(k => edges(k, n));
    };
    edges(root, null);
    out.w = width.get(root.id); out.h = TOP + depthMax * LEVEL + 22 + 14;
    return out;
  }
  // Tile data (for vecHtml / hexHtml) for any scalar or vector node at (x, y)
  tileOf(n, x, y) {
    const lk = this.look(n);
    if (n.t === 'v') {
      const et = this.elText(n);
      return { kind: 'vec', w: n.w, t: { x: x, y: y, w: n.w, type: n.type, el: et, elSize: et.length > 4 ? 21 : 27, face: lk.face, fg: lk.fg, lip: lk.lip,
        hasField: !!n.field, fLabel: this.fieldSym(n.field), pieceScale: 1, pieceBg: '#F2B33D', z: 6, scale: 1, shadow: 7, anim: 'none', dx: 0, dy: 0,
        down: null, pieceDown: null, aria: 'Vector ' + et } };
    }
    return { kind: 'hex', w: 96, t: { x: x, y: y, dx: 0, dy: 0, el: n.el, elSize: n.el.length > 3 ? 20 : 28, type: this.fieldSym(n.field), band: '#F2B33D', sink: 0,
      face: lk.face, fg: lk.fg, lip: lk.lip, z: 6, scale: 1, shadow: 7, anim: 'none', down: null, aria: 'Scalar ' + n.el } };
  }
  draggedItem(kind) {
    const d = this.idrag; if (!d || !d.moved || d.node.t === 'prod' || d.node.t === 'sum' || true) return [];
    const T = this.tileOf(d.node, d.x, d.y);
    return T.kind === kind ? [Object.assign(T.t, { z: 990, scale: 1.04, shadow: 14 })] : [];
  }
  // The tray popup (overlay units: 560 wide, scaled like the board at zoom 1): the two zeros, then whatever the player
  // has tapped, flowing in rows. Its tiles start a drag from where they sit on screen, converted to board
  // coordinates; the popup hides while a drag lasts. New items pop in.
  trayVals(zs, zp, zeroHex, zeroTile, po, oneHex) {
    const St = this.state;
    const toWorld = (ox, oy) => ({ x: ox / St.zoom - St.panX, y: oy / St.zoom - St.panY });
    const stop = e => { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); };
    const pieceStart = pc => (e, ox, oy) => {
      const w = toWorld(ox, oy);
      this.setState({ pieces: this.state.pieces.map(p => p.id === pc.id ? Object.assign({}, p, { x: w.x, y: w.y }) : p) });
      this.pdrag = { id: pc.id, sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y, moved: false };
    };
    const itemStart = it => (e, ox, oy) => {
      const w = toWorld(ox, oy);
      const f = this.fingerAt(e);
      this.idrag = { id: it.id, node: it.node, sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y, x: w.x, y: w.y, fx: f.x, fy: f.y, moved: false };
    };
    // the variables ASSUMPTIONS declares sit in the tray too: drag one out like a tree piece (onto a 0 or 1 of its
    // type), tap it to see it as a tree (where its − or ∃ form is)
    const varStart = n => (e, ox, oy) => { itemStart({ id: n.id, node: n })(e, ox, oy); this.idrag.tap = () => this.setState({ tree: { root: this.cloneFresh(n) }, treeLeaving: [], trayOpen: true, trayTab: 'tray' }); };
    const entries = [{ kind: 'hex', w: 96, t: zeroHex, start: pieceStart(zs) }, { kind: 'vec', w: this.K.ZW, t: zeroTile, start: pieceStart(zp) }]
      .concat(po ? [{ kind: 'hex', w: 96, t: oneHex, start: pieceStart(po) }] : [])
      .concat(this.varItems().map(n => Object.assign(this.tileOf(n, 0, 0), { start: varStart(n), id: n.id })))
      .concat((St.trayItems || []).map(it => Object.assign(this.tileOf(it.node, 0, 0), { start: itemStart(it), id: it.id })));
    let x = 22, y = 64, rows = 1;
    entries.forEach(en => { if (x > 22 && x + en.w > 528 - 18) { x = 22; y += 104; rows++; } en.px = x; en.py = y; x += en.w + 14; });
    const bottom = 84; const room = (St.bh || 716) / this.fitScale() - bottom - 140;
    const TV = St.tree ? this.treeVals(St.tree.root) : null;
    const hypsY = 64 + rows * 104;
    const hyps = (St.hyps || []).map((h, i) => {
      const text = h.label + ' : ' + (h.forall || '') + this.exprText(h.lhs, true) + ' = ' + this.exprText(h.rhs, true);
      return { text: text, x: 22 + i * 252, y: hypsY,
        down: e => { stop(e); const f = this.fingerAt(e); this.hdrag = { hyp: h, sx: e.clientX, sy: e.clientY, fx: f.x, fy: f.y, x: f.x, y: f.y, moved: false, text: text }; } };
    });
    const treeTop = hypsY + (hyps.length ? 64 : 0);
    const sc = TV ? Math.min(1, 488 / TV.w, Math.max(0.35, (room - treeTop - 50) / TV.h)) : 1;
    const full = (St.bh || 716) / this.fitScale();
    const tools = St.trayTab === 'tools';
    const H = tools ? full : (St.trayTab === 'lean') ? Math.min(560, room) : treeTop + (TV ? TV.h * sc + 10 : 0) + 40;
    const top = tools ? 0 : full - bottom - H;
    let tree = null;
    if (TV) {
      const tx0 = 20 + (488 - TV.w * sc) / 2;
      const ov = (x, y) => ({ ox: 16 + tx0 + x * sc, oy: top + treeTop + y * sc });
      const treeStart = (n, x, y) => e => {
        stop(e);
        const o = ov(x, y); const w = toWorld(o.ox, o.oy);
        const f = this.fingerAt(e);
        this.idrag = { id: n.id, node: this.cloneFresh(n), sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y, x: w.x, y: w.y, fx: f.x, fy: f.y, moved: false, tap: () => this.treeTap(n.id) };
      };
      const opNode = id => this.treeFind(St.tree.root, id);
      tree = Object.assign({}, TV, { x: tx0, y: treeTop, scale: sc,
        nodes: TV.nodes.map(m => Object.assign({}, m, { down: treeStart(m.node, m.x, m.y), mini: m.kind === 'leaf' ? this.tileOf(m.node, 0, 0) : null })),
        wraps: TV.wraps.map(w => Object.assign({}, w, { down: treeStart(opNode(w.op), w.x, w.y) })),
        leaving: St.treeLeaving || [] });
    }
    const tiles = entries.map(en => {
      const fresh = en.id && St.trayNew && St.trayNew[en.id] != null;
      return Object.assign({}, en.t, { x: en.px, y: en.py, z: 1, scale: 1, shadow: 7,
        anim: fresh ? 'trayPop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) ' + St.trayNew[en.id] + 's both' : 'none',
        down: e => { stop(e); en.start(e, 16 + en.px, top + en.py); } });
    });
    const dragging = (this.pdrag && this.pdrag.moved) || (this.idrag && this.idrag.moved) || (this.hdrag && this.hdrag.moved);
    return {
      open: !!St.trayOpen, show: !!St.trayOpen && !dragging, tab: St.trayTab || 'tray', top: top, h: H, lean: this.leanVals(), tools: tools,
      // the concept graph's current node: back to the game (the panel slides away, the tray tab comes back next time)
      play: () => { this.setState({ trayClosing: true }); clearTimeout(this._tc); this._tc = setTimeout(() => this.setState({ trayOpen: false, trayClosing: false, trayTab: 'tray' }), 220); },
      list: tiles.map((t, i) => ({ kind: entries[i].kind, t: t })), tiles: { hex: tiles[0], vec: tiles[1], one: po ? tiles[2] : null }, captionY: H - 34, tree: tree, hyps: hyps,
      closing: !!St.trayClosing,
      // open: the panel slides up; close: it slides back down first
      toggle: () => {
        if (!this.state.trayOpen) { clearTimeout(this._tc); this.setState({ trayOpen: true, trayClosing: false }); return; }
        this.setState({ trayClosing: true });
        clearTimeout(this._tc);
        this._tc = setTimeout(() => this.setState({ trayOpen: false, trayClosing: false }), 220);
      },
      pick: tab => () => this.setState({ trayTab: tab })
    };
  }
  textW(t) {
    let w = t.length * 12;
    try {
      if (typeof document !== 'undefined') {
        const c = this._cv || (this._cv = document.createElement('canvas').getContext('2d'));
        c.font = '24px "STIX Two Text", "Cambria Math", "Times New Roman", serif';
        w = c.measureText(t).width;
      }
    } catch (e) { /* no canvas: keep the estimate */ }
    return w;
  }
  // The theorem's header, above the expression. Each block is plain text (the same size as the readout); tapped, the
  // pieces that have a tile grow one behind their text: the text slides over to make room, then the tile pops up
  // under it. Room for the tiles is always kept, so nothing moves vertically.
  headVals() {
    const St = this.state; const K = this.K;
    const V = (bg, lip, fg) => ({ kind: 'para', bg: bg, lip: lip, fg: fg });
    const vT = V('#2F5BD3', '#1E3A8A', '#FFFFFF'), rT = V('#F2B33D', '#B7791F', '#2A1D04');
    const decl = ([el, key]) => ['(' + el + ' : 𝑉)', { kind: 'decl', name: el, type: '𝑉', node: this.mkV('𝑉', el, key, 'R', 140) }];
    const base = [['{'], ['𝑉', vT], [' : Type}   [VectorSpace '], ['ℝ', rT], [' '], ['𝑉', vT], [']']]
      .concat(...(St.scalars || []).map(([el, f]) => [['   (' + el + ' : '], [f, rT], [')']]));
    const rowsA = [];
    if (St.vars) {
      rowsA.push(base);
      rowsA.push([].concat(...St.vars.map((x, i) => (i ? [['  ']] : []).concat([decl(x)]))));
    } else rowsA.push(base.concat([['   '], decl(['𝑣', 'v'])]));
    const side = ns => this.exprText(ns, true); // the readout's notation
    const htext = h => '(' + h.label + ' : ' + (h.forall || '') + side(h.lhs) + ' = ' + side(h.rhs) + ')';
    const own = (St.hyps || []).filter(h => !h.wit), wits = (St.hyps || []).filter(h => h.wit);
    // a hypothesis whose board is in the box leaves its place to the expression (a small dashed box)
    const exprMini = () => this.exprText(this.exprRun(), true);
    const hypTok = h => St.ws === h.name ? [exprMini(), null, { slot: 'label', ws: h.name }] : [htext(h), null, { hyp: h }];
    if (own.length) rowsA.push([].concat(...own.map((h, i) => (i ? [['   ']] : []).concat([hypTok(h)]))));
    // a witness from the inverse axiom: its vector and its hypothesis, on a line of their own
    wits.forEach(h => { const w = h.lhs[h.lhs.length - 1]; rowsA.push([decl([w.el, w.key]), ['   '], hypTok(h)]); });
    const goal = St.ws === 'goal' ? [[exprMini(), null, { slot: 'plain', ws: 'goal' }]] : this.nodeTokens(St.goal);
    const build = (key, title, y, rowsIn) => {
      const on = !!(St.tiles && St.tiles[key]);
      const mk = list => list.map(([t, tile, opt]) => {
        const tw = this.textW(t);
        if (!tile) return { t: t, w: tw, hyp: opt && opt.hyp ? opt.hyp : null, slot: opt && opt.slot ? opt.slot : null, ws: opt && opt.ws ? opt.ws : null };
        let W, html_ = null, padL = 0, fg = '#16130C';
        if (tile.kind === 'decl') {
          // text: ( 𝑣 : 𝑉 ) in a row. Tile: the 𝑣 tile; 𝑣 stays the same size at the tile's element (it only slides
          // sideways), 𝑉 rises into the band and shrinks, the brackets and colon fade.
          const T = this.tileOf(tile.node, 0, 0); Object.assign(T.t, { el: '', type: '', shadow: 4, aria: '' });
          const w = { o: this.textW('('), n: this.textW(tile.name), c: this.textW(' : '), t: this.textW(tile.type), e: this.textW(')') };
          const Wt = T.w / 2;
          const at = { o: 0, n: w.o, c: w.o + w.n, t: w.o + w.n + w.c, e: w.o + w.n + w.c + w.t };
          return { t: t, w: tw, tile: tile, on: on, width: on ? Wt : tw, W: Wt, mini: { kind: 'vec', t: T.t, w: T.w }, fg: '#16130C',
            parts: [
              { s: '(', x: on ? at.o : at.o, op: on ? 0 : 1 },
              { s: tile.name, x: on ? Wt / 2 + 8.5 - w.n / 2 : at.n, op: 1, color: on ? '#16130C' : null },
              { s: ' : ', x: at.c, op: on ? 0 : 1 },
              { s: tile.type, x: on ? 43.5 - w.t / 2 : at.t, op: 1, color: on ? '#FFFFFF' : null, tf: on ? 'translateY(-21.5px) scale(0.45)' : 'none' },
              { s: ')', x: at.e, op: on ? 0 : 1 }
            ] };
        }
        if (tile.kind === 'para') { W = 46; fg = tile.fg; }
        else {
          const T = this.tileOf(tile.node, 0, 0);
          Object.assign(T.t, { el: '', shadow: 4, aria: '' });
          W = T.w / 2; fg = T.t.fg; padL = T.kind === 'vec' ? 17 : 0;
          html_ = { kind: T.kind, t: T.t, w: T.w };
        }
        W = Math.max(W, tw + 8);
        return { t: t, w: tw, tile: tile, on: on, width: on ? W : tw, W: W, padL: padL, fg: fg, mini: html_ };
      });
      const rows = rowsIn.map(mk);
      const toggle = () => this.setState({ tiles: Object.assign({}, this.state.tiles, { [key]: !on }) });
      // a tap switches the tiles; a double tap on GOAL brings the goal's board into the box (and back)
      return { key: key, title: title, y: y, on: on, rows: rows, tokens: [].concat(...rows), toggle: toggle,
        tap: e => { if (e && e.stopPropagation) e.stopPropagation(); this.headTap(key === 'goal' ? (St.ws === 'goal' ? 'expr' : 'goal') : null, toggle); } };
    };
    return [build('assume', 'ASSUMPTIONS', K.AY, rowsA), build('goal', St.ws === 'goal' ? 'EXPRESSION' : 'GOAL · ' + (St.level || ''), K.GY, [goal])];
  }
  // [text, tile] pairs for a small expression tree (the goal): each scalar and vector gets its tile
  nodeTokens(n) {
    if (!n) return [];
    if (n.t === 's' || n.t === 'v') return [[this.elText(n), { kind: 'node', node: n }]];
    if (n.t === 'sum') return [['(']].concat(...n.terms.map((t, i) => (i ? [[' + ']] : []).concat(this.nodeTokens(t.node))), [[')']]);
    return [].concat(...n.factors.map((f, i) => (i ? [['·']] : []).concat(this.nodeTokens(f))), n.vec ? this.nodeTokens(n.vec) : []);
  }
  // What the Lean tab shows: the machine's status, then the live proof as Lean sees it
  leanVals() {
    const st = this.state.leanStatus || { state: this.props.lean ? 'asleep' : 'offline' };
    const live = this.state.leanLive || { state: 'idle', steps: [], goals: [] };
    const words = { asleep: 'Lean is asleep. Press Play (top left) to start it; your moves so far will be replayed.', starting: 'Starting the Lean machine…',
      booting: st.detail || 'Lean is starting…', capped: st.detail || 'Lean has started too often today.', off: 'The Lean machine is switched off.',
      offline: st.detail || 'Lean isn’t reachable.', error: st.detail || 'Lean had a problem.' };
    return {
      status: st.state === 'ready' ? (live.state === 'starting' ? 'Opening the proof…' : live.state === 'error' ? 'Lean: ' + live.error : 'Lean is running this proof live') : words[st.state] || st.state,
      ready: st.state === 'ready', live: live
    };
  }
  // The dotted box around the expression: it hugs the expression's tiles (growing and shrinking as they move, so it
  // shows when part of the expression is off screen) and always holds the EXPRESSION heading and the readout under it.
  zoneBox(readout, noTiles) {
    const K = this.K;
    const textW = readout ? Math.min(520, 34 + 13.2 * readout.main.length) : 140;
    const box = { l: 14, r: Math.max(28 + 130, 28 + textW) + 16, t: K.ZT, b: K.ZT + (readout ? 34 + (readout.note ? 64 : 46) : 30) + 20 };
    (noTiles ? [] : this.zoneIds).forEach(id => {
      const p = this.P.get(id); if (!p) return;
      box.l = Math.min(box.l, p.x - 24); box.r = Math.max(box.r, p.x + p.w + 24);
      box.t = Math.min(box.t, p.y - 24); box.b = Math.max(box.b, p.y + p.h + 24);
    });
    return box;
  }
  // the layer the board's tiles live in: while boards swap it falls away into the distance (toward the box's
  // middle), stays hidden while they swing, then the new tiles come in from far away
  wsLayerStyle(A) {
    const base = 'position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 6;';
    if (!A) return base;
    const o = `transform-origin: ${A.vp.x}px ${A.vp.y}px;`;
    if (A.phase === 'out') return base + o + ' animation: wsAway 0.34s cubic-bezier(0.5, 0, 0.9, 0.5) both; pointer-events: none';
    if (A.phase === 'swing') return base + ' opacity: 0; pointer-events: none';
    return base + o + ' animation: wsCome 0.56s cubic-bezier(0.1, 0.6, 0.3, 1) both';
  }
  // a hypothesis's board: the = at the start of its second row
  eqSign() {
    if (!this.isHypWs(this.state.ws)) return null;
    const ids = ((this.zoneSets || []).find(z => z.key === 'zoneR') || { ids: [] }).ids;
    const ps = ids.map(id => this.P.get(id)).filter(Boolean);
    const first = ps.sort((a, b) => a.x - b.x)[0];
    return first ? { x: Math.min(first.x - 50, 30), y: first.y + first.h / 2 - 22 } : { x: 30, y: this.K.ZT + 297 };
  }
  // One header block (ASSUMPTIONS or GOAL): its title, then its tokens on one line. A token with a tile has a fixed
  // box whose width animates between its text's and its tile's; the tile pops up behind the text after the slide
  // (and shrinks first when switching back).
  headHtml(h, won) {
    const title = h.key === 'goal' && won ? '#F2B33D' : '#94A3B8';
    const A = this.state.wsAnim; const swing = !!(A && A.phase === 'swing');
    return html`
    <div onClick=${h.tap} role="button" aria-pressed=${h.on ? 'true' : 'false'} aria-label=${h.title + ': tap to show or hide the tiles'} style=${`position: absolute; left: 14px; top: ${h.y}px; padding: 0 14px; min-width: 260px; pointer-events: auto; cursor: pointer; z-index: 5`}>
      <div style=${`font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: ${title}`}>${h.title}</div>
      ${h.rows.map((row, ri) => html`<div style=${`position: relative; height: 58px; margin-top: ${ri ? 0 : 10}px; display: flex; white-space: pre; font-family: 'STIX Two Text', 'Cambria Math', 'Times New Roman', serif; font-size: 24px; color: #E2E8F0; opacity: ${swing && h.key === 'goal' && (A.from === 'goal' || A.to === 'goal') ? 0 : 1}`}>
        ${row.map(k => k.slot ? html`<span onPointerDown=${e => e.stopPropagation()} onClick=${e => { e.stopPropagation(); this.headTap('expr', null); }} role="button" aria-label=${'The expression, ' + k.t + ': double-tap to bring it back'}
            style=${`flex: 0 0 auto; position: relative; box-sizing: border-box; margin: ${k.slot === 'label' ? 4 : 9}px 3px 0; height: ${k.slot === 'label' ? 50 : 40}px; padding: ${k.slot === 'label' ? 14 : 0}px 10px 0; line-height: ${k.slot === 'label' ? 32 : 37}px; border: 2px dashed rgba(148,163,184,0.5); border-radius: 12px; color: #E2E8F0; cursor: pointer; opacity: ${swing ? 0 : 1}; transition: opacity 0.2s ease`}>
            ${k.slot === 'label' ? html`<span style="position: absolute; left: 9px; top: 3px; line-height: 12px; font-family: Inter, system-ui, sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #94A3B8">EXPRESSION</span>` : null}${k.t}</span>`
          : !k.tile ? html`<span onPointerDown=${k.hyp ? this.hypDown(k.hyp, k.t) : null} onClick=${k.hyp ? (e => { e.stopPropagation(); this.headTap(k.hyp.name, h.toggle); }) : null} style=${k.hyp
          ? 'flex: 0 0 auto; box-sizing: border-box; margin: 9px 3px 0; height: 40px; line-height: 37px; padding: 0 9px; border: 1.5px solid rgba(125,211,252,0.7); border-radius: 12px; background: rgba(14,116,144,0.22); color: #BAE6FD; cursor: grab; touch-action: none' + (swing && (k.hyp.name === A.from || k.hyp.name === A.to) ? '; opacity: 0' : '') // a card: it can be dragged
          : 'flex: 0 0 auto; padding-top: 14px; height: 30px; line-height: 30px'}>${k.t}</span>` : html`
          <span style=${`position: relative; flex: 0 0 auto; height: 58px; width: ${k.width}px; transition: width 0.35s ease ${k.on ? '0s' : '0.2s'}`}>
            <span style=${`position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform: scale(${k.on ? 1 : 0}); transform-origin: 50% 40%; transition: transform 0.32s cubic-bezier(0.2, 1.5, 0.4, 1) ${k.on ? '0.22s' : '0s'}; pointer-events: none`}>
              ${k.tile.kind === 'para' ? html`
                <span style=${`position: absolute; left: ${(k.W - 46) / 2}px; top: 17px; width: 46px; height: 30px; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: ${k.tile.lip}`}></span>
                <span style=${`position: absolute; left: ${(k.W - 46) / 2}px; top: 14px; width: 46px; height: 30px; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: ${k.tile.bg}`}></span>
              ` : html`
                <span style=${`position: absolute; left: ${(k.W - k.mini.w) / 2}px; top: -22px; width: ${k.mini.w}px; height: 88px; transform: scale(0.5); transform-origin: 50% 50%`}>${k.mini.kind === 'vec' ? this.vecHtml(k.mini.t) : this.hexHtml(k.mini.t)}</span>
              `}
            </span>
            ${k.parts ? k.parts.map(pt => html`<span style=${`position: absolute; left: ${pt.x}px; top: 14px; height: 30px; line-height: 30px; white-space: pre; z-index: 1; opacity: ${pt.op}; color: ${pt.color || 'inherit'}; transform: ${pt.tf || 'none'}; transform-origin: 50% 50%;
              transition: left 0.35s ease ${k.on ? '0s' : '0.2s'}, transform 0.35s ease ${k.on ? '0s' : '0.2s'}, opacity 0.2s ease ${k.on ? '0s' : '0.25s'}, color 0.3s ease`}>${pt.s}</span>`) : html`
            <span style=${`position: absolute; left: 0; right: 0; top: 14px; height: 30px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding-left: ${k.on ? k.padL : 0}px; color: ${k.on ? k.fg : 'inherit'}; transition: padding 0.35s ease, color 0.3s ease; z-index: 1`}>${k.t}</span>`}
          </span>`)}
      </div>`)}
    </div>`;
  }
  // The Lean tab: a watch window on the live proof. The theorem as Lean has it, each board move as a step (✓ when Lean
  // accepted it, ✗ with Lean's error when not), and the goal as Lean prints it; at the end, Lean's "No goals" and
  // whether the whole proof compiled from scratch.
  leanHtml(L) {
    const mono = "font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; line-height: 20px; white-space: pre-wrap; word-break: break-word";
    const live = L.live; const goals = live.goals || [];
    return html`
    <div style="position: absolute; left: 0; right: 0; top: 64px; bottom: 0; overflow: auto; padding: 0 22px 18px; box-sizing: border-box">
      <div style=${`display: flex; align-items: center; gap: 10px; font-size: 15px; color: ${live.state === 'error' ? '#FCA5A5' : '#CBD5E1'}`}>
        <span style=${`width: 10px; height: 10px; border-radius: 5px; flex: 0 0 auto; background: ${L.ready ? '#34D399' : '#94A3B8'}`}></span>${L.status}
      </div>
      ${live.theorem ? html`<div style=${`${mono}; margin-top: 12px; color: #94A3B8`}>${live.theorem}</div>` : null}
      ${live.steps && live.steps.length ? html`<div style="margin-top: 10px; display: flex; flex-direction: column; gap: 4px">
        ${live.steps.map((st, i) => html`<div style=${`${mono}; color: ${st.ok ? '#A7F3D0' : '#FCA5A5'}`}>${(i + 1) + '  ' + (st.ok ? '✓ ' : '✗ ') + ((st.hint && st.hint[0]) || 'rearrange') + (st.error ? '\n   ' + st.error : '')}</div>`)}
      </div>` : null}
      ${live.state === 'live' ? html`
        <div style=${`margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,0.25); border: 1.5px solid ${live.done ? '#34D399' : 'rgba(255,255,255,0.12)'}`}>
          ${live.done ? html`
            <div style="font-size: 17px; font-weight: 700; color: #6EE7B7">No goals</div>
            <div style=${`margin-top: 6px; font-size: 14px; color: ${live.verified ? '#A7F3D0' : '#FCA5A5'}`}>${live.verified ? 'Lean checked the whole proof from scratch ✓' : 'The steps closed the goal, but the whole proof didn’t compile'}</div>
          ` : goals.map(g => html`<div style=${`${mono}; color: #E2E8F0`}>${g}</div>`)}
        </div>` : null}
    </div>`;
  }
  // The tree in the tray. Edges in SVG; operators as circles; leaves as half-size tiles; − and ⁻¹ nodes on the edges
  // (keyed, so they slide when one is added or removed, and pop in when new); boxes around negated or inverted
  // subtrees; whatever was just removed pops out where it was.
  treeHtml(T) {
    const wrap = w => w.kind === 'wit'
      ? html`<span style="display: flex; align-items: center; justify-content: center; width: 208px; height: 32px; box-sizing: border-box; border-radius: 16px; background: rgba(8,51,68,1); border: 2px solid #22D3EE; color: #CFFAFE; font-family: 'STIX Two Text', serif; font-size: 16px; white-space: pre">∀𝑣 : 𝑉, ∃𝑤 : 𝑉, 𝑣 + 𝑤 = 0</span>`
      : w.kind === 'neg'
      ? html`<span style=${`display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 17px; background: ${w.night}; border: 1.5px solid rgba(255,255,255,0.35); color: #F8FAFC; font-size: 24px; font-weight: 600`}>−</span>`
      : html`<span style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 17px; background: rgba(27,37,58,1); border: 2px solid #F2B33D; color: #FDE68A; font-family: 'STIX Two Text', serif; font-size: 19px"><i>x</i><sup style="font-size: 11px; margin-left: 1px; transform: translateY(-1px)">−1</sup></span>`;
    const box = b => `position: absolute; left: ${b.x}px; top: ${b.y}px; width: ${b.w}px; height: ${b.h}px; box-sizing: border-box; border-radius: 16px; pointer-events: none;
      border: 2px ${b.wit ? 'dashed #22D3EE' : 'solid ' + (b.inv ? '#F2B33D' : 'rgba(148,163,184,0.45)')}; background: ${b.neg ? `linear-gradient(to bottom, rgba(255,255,255,0.03) 45%, ${b.night} 45%)` : 'transparent'}; transition: left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease`;
    return html`
    <div style=${`position: absolute; left: ${T.x}px; top: ${T.y}px; width: ${T.w}px; height: ${T.h}px; transform: scale(${T.scale}); transform-origin: 0 0; pointer-events: auto`}>
      ${T.boxes.map(b => html`<div key=${b.key} style=${box(b) + '; animation: boxIn 0.32s cubic-bezier(0.2, 1.4, 0.4, 1) both'}></div>`)}
      ${T.leaving.filter(l => l.box).map(b => html`<div key=${b.key + ':out'} style=${box(b) + '; animation: boxOut 0.3s ease-in both'}></div>`)}
      <svg width=${T.w} height=${T.h} style="position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none">
        ${T.edges.map(e => html`<line x1=${e.x1} y1=${e.y1} x2=${e.x2} y2=${e.y2} stroke="rgba(203,213,225,0.55)" stroke-width="2" stroke-linecap="round"></line>`)}
      </svg>
      ${T.nodes.map(m => m.kind === 'op' ? html`
        <button key=${m.key} onPointerDown=${m.down} aria-label=${'Operator ' + m.sym + ': tap to negate or invert this group, drag it out'} style=${`position: absolute; left: ${m.x}px; top: ${m.y}px; width: 34px; height: 34px; padding: 0; border-radius: 17px; border: 1.5px solid rgba(203,213,225,0.6); background: rgba(27,37,58,1); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 22px; line-height: 30px; touch-action: none; cursor: grab`}>${m.sym}</button>
      ` : html`
        <div key=${m.key} onPointerDown=${m.down} style=${`position: absolute; left: ${m.x}px; top: ${m.y}px; width: ${m.w}px; height: 44px; touch-action: none; cursor: grab`}>
          <div style=${`position: absolute; left: ${(m.w - m.mini.w) / 2}px; top: -22px; width: ${m.mini.w}px; height: 88px; transform: scale(0.5); transform-origin: 50% 50%; pointer-events: none`}>${m.mini.kind === 'vec' ? this.vecHtml(m.mini.t) : this.hexHtml(m.mini.t)}</div>
        </div>`)}
      ${T.wraps.map(w => html`<div key=${w.key} onPointerDown=${w.down} role="button" aria-label=${w.kind === 'wit' ? 'Inverse axiom: some w with this + w = 0. Drag the group out onto a 0' : w.kind === 'neg' ? 'Additive inverse: tap to change, drag the group out' : 'Multiplicative inverse: tap to change, drag the group out'} style=${`position: absolute; left: ${w.x}px; top: ${w.y}px; touch-action: none; cursor: grab; transition: left 0.25s ease, top 0.25s ease; animation: trayPop 0.35s cubic-bezier(0.2, 1.5, 0.4, 1) both`}>${wrap(w)}</div>`)}
      ${T.leaving.filter(l => l.wrap).map(w => html`<div key=${w.key + ':out'} style=${`position: absolute; left: ${w.x}px; top: ${w.y}px; pointer-events: none; animation: popOut 0.3s ease-in both`}>${wrap(w)}</div>`)}
    </div>`;
  }
  /* ---------- render ---------- */
  vecHtml(t) {
    return html`
      <button key=${t.id} onPointerDown=${t.down} aria-label=${t.aria} style=${`transition: ${t.tr || 'none'}; position: absolute; left: ${t.x}px; top: ${t.y}px; width: ${t.w}px; height: 88px; padding: 0; border: none; background: transparent; touch-action: none; cursor: grab; z-index: ${t.z}; transform: scale(${t.scale}); filter: drop-shadow(0 ${t.shadow}px 12px rgba(0,0,0,0.40)); animation: ${t.anim}; --dx: ${t.dx}px; --dy: ${t.dy}px; font-family: inherit`}>
        <span style="position: absolute; left: 0; top: 5px; width: 52px; height: 83px; display: block; clip-path: polygon(0 0, 30px 0, 52px 50%, 30px 100%, 0 100%, 22px 50%); background: #B7791F"></span>
        <span style="position: absolute; left: 0; top: 0; width: 52px; height: 83px; display: block; clip-path: polygon(0 0, 30px 0, 52px 50%, 30px 100%, 0 100%, 22px 50%); background: #F1E7CD">
          <span style="position: absolute; left: 0; top: 0; width: 52px; height: 30px; display: block; background: #C38F2A; box-shadow: inset 0 3px 6px rgba(60,38,0,0.60)"></span>
          <span style="position: absolute; left: 8px; top: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: #5A420E; font-size: 17px; font-weight: 700">𝐅</span>
        </span>
        <span style="position: absolute; left: 0; top: 5px; width: 100%; height: 83px; display: block; clip-path: polygon(33px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 33px 100%, 55px 50%); background: ${t.lip}"></span>
        <span style=${`position: absolute; left: 0; top: 0; width: 100%; height: 83px; display: block; clip-path: polygon(33px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 33px 100%, 55px 50%); background: ${t.face}`}>
          <span style=${`position: absolute; left: 0; top: 0; right: 0; height: 30px; box-sizing: border-box; padding: 0 26px 0 60px; display: flex; align-items: center; justify-content: center; background: ${t.vband || '#2F5BD3'}; box-shadow: ${t.vbandShadow || 'none'}; color: ${t.vbandFg || '#FFFFFF'}; font-size: 15px; font-weight: 700; white-space: nowrap`}>${t.type}</span>
          <span style=${`position: absolute; left: 0; top: 30px; right: 0; bottom: 0; box-sizing: border-box; padding: 0 26px 0 60px; display: flex; align-items: center; justify-content: center; font-size: ${t.elSize}px; color: ${t.fg}; white-space: nowrap`}>${t.el}</span>
        </span>
        ${t.hasField ? html`
          <span onPointerDown=${t.pieceDown} style=${`position: absolute; left: 0; top: 0; width: 46px; height: 34px; display: block; transform: scale(${t.pieceScale})`}>
            <span style="position: absolute; left: 0; top: 3px; width: 46px; height: 30px; display: block; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: #B7791F"></span>
            <span style=${`position: absolute; left: 0; top: 0; width: 46px; height: 30px; display: flex; align-items: center; justify-content: center; clip-path: polygon(0 0, 30px 0, 45.9px 100%, 15.9px 100%); background: ${t.pieceBg}; color: #2A1D04; font-size: 17px; font-weight: 700`}>${t.fLabel}</span>
          </span>
        ` : null}
      </button>`;
  }
  hexHtml(t) {
    return html`
      <button key=${t.id} onPointerDown=${t.down} aria-label=${t.aria} style=${`transition: ${t.tr || 'none'}; position: absolute; left: ${t.x}px; top: ${t.y}px; width: 96px; height: 88px; padding: 0; border: none; background: transparent; touch-action: none; cursor: grab; z-index: ${t.z}; transform: translateY(${t.sink}px) scale(${t.scale}); filter: drop-shadow(0 ${t.shadow}px 12px rgba(0,0,0,0.40)); animation: ${t.anim}; --dx: ${t.dx}px; --dy: ${t.dy}px; font-family: inherit`}>
        <span style="position: absolute; left: 0; top: 5px; width: 100%; height: 83px; display: block; clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%); background: ${t.lip}"></span>
        <span style=${`position: absolute; left: 0; top: 0; width: 100%; height: 83px; display: flex; flex-direction: column; clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%); background: ${t.face}`}>
          <span style=${`height: 30px; display: flex; align-items: center; justify-content: center; background: ${t.band}; box-shadow: ${t.bandShadow || 'none'}; color: ${t.bandFg || '#2A1D04'}; font-size: 17px; font-weight: 700`}>${t.type}</span>
          <span style=${`flex: 1 1 auto; display: flex; align-items: center; justify-content: center; font-size: ${t.elSize}px; color: ${t.fg}; white-space: nowrap`}>${t.el}</span>
        </span>
      </button>`;
  }
  renderVals() {
    const St = this.state;
    this._ov = St.override;
    this._dset = new Set(St.dragIds || []);
    this._glow = St.preview && (St.preview.type === 'collect' || St.preview.type === 'collectV') ? new Set(St.preview.glow) : null;
    if (St.zeroHover) this._glow = new Set(St.zeroHover.glow || [St.zeroHover.id]);
    const R = this.layout(St.tops);
    if (this.idrag && this.idrag.moved) { this.measure(this.idrag.node); this.place(this.idrag.node, this.idrag.x, this.idrag.y, 0, { z: 990 }); }
    const zb = { l: 10, r: 550, t: this.K.ZT, b: this.K.ZB }; // set below, once the readout is known
    const results = [];
    // While a tile is being dragged, the readout stays as it was when the drag began, with the moving part (and
    // what it would act on) glowing; it changes once the move is done.
    const dragging = this.drag && this.drag.moved && this.drag.snap;
    const ro = dragging ? this.drag.snap : this.readoutOf(St.tops);
    if (ro) {
      const hot = new Set(St.dragIds || []);
      if (this._glow) this._glow.forEach(id => hot.add(id));
      if (St.preview && St.preview.gid && this.drag) { const g = this.locate(this.drag.orig, St.preview.gid); if (g) this.ids(g.node).forEach(id => hot.add(id)); }
      const segs = [];
      ro.tokens.forEach(k => { const h = k.id != null && hot.has(k.id); const last = segs[segs.length - 1]; if (last && last.hot === h) last.t += k.t; else segs.push({ t: k.t, hot: h }); });
      const red = { bg: 'rgba(248,113,113,0.16)', border: '#F87171', fg: '#FEE2E2' };
      const green = { bg: 'rgba(52,211,153,0.16)', border: '#34D399', fg: '#D1FAE5' };
      this.zoneValue = ro.ok && ro.val ? '= ' + this.fmtVal(ro.val) : null; // the old readout, still used by the tests
      const main = segs.map(x => x.t).join('');
      results.push(Object.assign({ x: 28, y: this.K.ZT + 34, main: main, segs: segs, note: ro.ok ? '' : ro.eq ? 'both sides need the same type' : 'terms in the expression need the same type' }, ro.ok ? green : red));
    }
    // while boards swap, the box hugs only its heading and readout (the tiles are away)
    const WA = St.wsAnim; const away = !!(WA && (WA.phase === 'out' || WA.phase === 'swing'));
    Object.assign(zb, this.zoneBox(results[0], away));
    this._zb = zb;
    // Level complete: the expression is exactly the goal. The expression's tiles hop with a few sparks, the box and
    // the readout turn gold. (What happens next comes later.)
    const won = !this.props.legacy && !!St.goal && !(this.drag && this.drag.moved) && !St.wsAnim && this.isWon();
    this._won = won;
    const sparks = [];
    if (won) {
      const inZone = new Set([].concat(...this.zoneIds.map(id => { const t = St.tops.find(u => u.node.id === id); return t ? this.ids(t.node) : []; }))); let k = 0;
      R.vecs.concat(R.hexes).forEach(t => {
        if (!inZone.has(t.id)) return;
        t.anim = 'winHop 0.9s ease-in-out ' + (0.1 * k) + 's 2 both';
        const p = this.P.get(t.id);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + k;
          sparks.push({ x: p.x + p.w / 2 - 5, y: p.y + p.h / 2 - 5, sx: Math.cos(a) * (70 + 20 * (i % 2)), sy: Math.sin(a) * (60 + 20 * (i % 2)), delay: 0.25 + 0.1 * k + 0.03 * i });
        }
        k++;
      });
      if (results[0]) Object.assign(results[0], { bg: 'rgba(242,179,61,0.18)', border: '#F2B33D', fg: '#FDE68A', note: 'goal reached' });
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
    const recessS = { band: '#C38F2A', bandShadow: 'inset 0 3px 6px rgba(60,38,0,0.6)', bandFg: '#5A420E' };
    const recessV = { vband: '#1F3F9A', vbandShadow: 'inset 0 3px 6px rgba(5,15,50,0.7)', vbandFg: '#B8C7F0' };
    Object.assign(zeroTile, recessV, zDrag && St.zeroHover ? {} : { type: '𝑉' });
    const po = St.pieces.find(p => p.kind === 'one'); const poDrag = !!(po && this.pdrag && this.pdrag.id === po.id);
    const oneHex = po ? Object.assign({ x: po.x, y: po.y, dx: 0, dy: 0, el: '1', elSize: 28, face: '#FFF8E6', fg: '#16130C', lip: '#B7791F', sink: 0,
      type: poDrag && St.zeroHover && St.zeroHover.f ? this.fieldSym(St.zeroHover.f) : '𝐅', z: poDrag ? 990 : 6, scale: poDrag ? 1.04 : 1, shadow: poDrag ? 14 : 7, anim: 'none',
      down: this.pieceDown(po), aria: 'The scalar 1: drag it onto a tile to multiply by 1' }, poDrag && St.zeroHover ? { band: '#F2B33D' } : recessS) : null;
    const zs = St.pieces.find(p => p.kind === 'zeroS'); const zsDrag = !!(this.pdrag && this.pdrag.id === zs.id);
    const zsHover = zsDrag && St.zeroHover;
    const zeroHex = { x: zs.x, y: zs.y, dx: 0, dy: 0, el: '0', elSize: 28, face: '#FFF8E6', fg: '#16130C', lip: '#B7791F', type: zs.field ? this.fieldSym(zs.field) : zsHover && zsHover.f ? this.fieldSym(zsHover.f) : '𝐅', band: '#F2B33D', sink: 0,
      z: zsDrag ? 990 : 6, scale: zsDrag ? 1.04 : 1, shadow: zsDrag ? 14 : 7, anim: 'none', down: this.pieceDown(zs),
      aria: 'The scalar zero: drag it onto a scalar, or onto a scalar sum’s right bracket, to add + 0' };
    if (!(zsDrag && zsHover)) Object.assign(zeroHex, recessS, { type: '𝐅' });
    return {
      setBoard: this.setBoard, panDown: this.panDown(), panX: St.panX, panY: St.panY, worldScale: this.scaleNow(),
      baseScale: this.fitScale(), overlayH: (St.bh || 716) / this.fitScale(),
      zoomIn: () => this.zoomAround(this.state.zoom * 1.25), zoomOut: () => this.zoomAround(this.state.zoom / 1.25),
      zoomReset: () => this.setState({ zoom: 1, panX: 0, panY: 0 }), showReset: Math.abs(St.zoom - 1) > 0.01 || St.panX !== 0 || St.panY !== 0, zoomPct: Math.round(St.zoom * 100),
      zoneL: zb.l, zoneW: zb.r - zb.l, zoneT: zb.t, zoneH: zb.b - zb.t,
      boxTitle: this.props.legacy ? 'EXPRESSION' : this.wsTitle(St.ws), wsAnim: WA || null, eqSign: this.eqSign(),
      ghosts: ghosts, groups: R.groups, pluses: R.pluses,
      vecs: R.vecs.concat(this.props.legacy || zDrag ? [zeroTile] : [], this.draggedItem('vec')), hexes: R.hexes.concat(this.props.legacy || zsDrag ? [zeroHex] : [], poDrag ? [oneHex] : [], this.draggedItem('hex')),
      boxes: R.boxes,
      heads: this.props.legacy ? null : this.headVals(), won: won, pickLevel: () => this.setState({ trayOpen: true, trayClosing: false, trayTab: 'tools' }), sparks: sparks, exprY: this.K.ZT + 10,
      hchip: this.hdrag && this.hdrag.moved ? { x: this.hdrag.x, y: this.hdrag.y, text: this.hdrag.text } : null,
      hist: this.props.legacy ? null : { canUndo: this.canUndo(), canRedo: this.canRedo(), undo: () => this.undo(), redo: () => this.redo(), rewind: () => this.rewind() },
      tray: this.props.legacy ? null : this.trayVals(zs, zp, zeroHex, zeroTile, po, oneHex), dots: R.dots, strips: strips,
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
      hint: rules ? 'Drag sideways to reorder · drag a scalar into the brackets beside it, or pull brackets off a vector, to distribute · drop a scalar or vector on a match to factor it out · drag a 0 from the tray onto a term to add + 0, or a 0 in the expression onto a term of its sum to remove it'
        : 'Scalars dock tip to tip or onto a vector’s edge · drop things inside ( + ) to add them · double-tap a + to tidy'
    };
  }

  render() {
    const v = this.renderVals();
    return html`
<div ref=${v.setBoard} style="width: 100%; height: 100%; position: relative; overflow: hidden; background-color: #121A2B; color: #F8FAFC; font-family: 'STIX Two Text', 'Cambria Math', 'Times New Roman', serif; user-select: none; -webkit-user-select: none">
  <div style=${`position: absolute; left: 0; top: 0; width: 560px; height: 1028px; transform: scale(${v.worldScale}) translate(${v.panX}px, ${v.panY}px); transform-origin: 0 0`}>
    <div onPointerDown=${v.panDown} aria-hidden="true" style="position: absolute; left: -4020px; top: -4020px; width: 9000px; height: 9000px; touch-action: none; cursor: grab; background-image: radial-gradient(rgba(148,163,184,0.22) 1.4px, transparent 2px); background-size: 30px 30px"></div>


    <div style=${`position: absolute; left: ${v.zoneL}px; top: ${v.zoneT}px; width: ${v.zoneW}px; height: ${v.zoneH}px; box-sizing: border-box; border-radius: 24px; border: 2px dashed rgba(148,163,184,0.28); pointer-events: none; transition: ${v.wsAnim && v.wsAnim.phase === 'in' ? 'left 0.5s ease-out, top 0.5s ease-out, width 0.5s ease-out, height 0.5s ease-out' : 'left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease'}; animation: ${v.won ? 'winBox 1.6s ease-out both' : 'none'}`}></div>
    <div style=${`position: absolute; left: 28px; top: ${v.exprY}px; font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: ${v.won ? '#F2B33D' : '#94A3B8'}; pointer-events: none; opacity: ${v.wsAnim && v.wsAnim.phase === 'swing' ? 0 : 1}`}>${v.boxTitle}</div>
    ${(v.heads || []).map(h => this.headHtml(h, v.won))}
    ${v.won ? html`<div role="status" style=${`position: absolute; left: ${v.zoneL + 6}px; top: ${v.zoneT + v.zoneH + 16}px; display: flex; align-items: center; gap: 14px; white-space: nowrap; transform-origin: 20% 50%; animation: trayPop 0.4s cubic-bezier(0.2, 1.5, 0.4, 1) 0.9s both; pointer-events: auto; z-index: 960`}>
      <span style="font-family: Inter, system-ui, sans-serif; font-size: 22px; font-weight: 700; color: #FDE68A">You won!</span>
      <button onClick=${v.pickLevel} style="height: 48px; padding: 0 20px; border-radius: 24px; border: 1.5px solid #F2B33D; background: rgba(242,179,61,0.16); color: #F2B33D; font-family: Inter, system-ui, sans-serif; font-size: 18px; font-weight: 700; cursor: pointer">Pick another level</button>
    </div>` : null}
    ${v.hchip ? html`<div aria-hidden="true" style=${`position: absolute; left: ${v.hchip.x}px; top: ${v.hchip.y}px; transform: translate(-50%, -130%); padding: 10px 16px; border-radius: 14px; border: 1.5px solid #7DD3FC; background: rgba(14,116,144,0.85); color: #E0F2FE; font-family: 'STIX Two Text', serif; font-size: 21px; white-space: nowrap; z-index: 990; pointer-events: none; box-shadow: 0 8px 18px rgba(0,0,0,0.4)`}>${v.hchip.text}</div>` : null}
    ${v.sparks.map(k => html`<div aria-hidden="true" style=${`position: absolute; left: ${k.x}px; top: ${k.y}px; width: 10px; height: 10px; border-radius: 2px; background: #FDE68A; box-shadow: 0 0 8px rgba(253,230,138,0.9); transform: rotate(45deg); z-index: 970; pointer-events: none; --sx: ${k.sx}px; --sy: ${k.sy}px; animation: spark 0.9s ease-out ${k.delay}s both`}></div>`)}
    ${v.legacy ? html`<div style=${`position: absolute; left: 10px; top: 546px; width: 540px; height: ${v.trayH}px; box-sizing: border-box; border-radius: 24px; border: 2px dashed rgba(148,163,184,0.28); background: rgba(255,255,255,0.02); opacity: ${v.trayOp}; pointer-events: none`}></div>
    <div style="position: absolute; left: 28px; top: 556px; font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: #94A3B8; pointer-events: none">TRAY</div>` : null}
    ${v.legacy ? html`<div style="position: absolute; left: 150px; right: 30px; top: 553px; font-size: 18px; color: #CBD5E1; text-align: right; pointer-events: none">𝑈: the plane 𝑥 − 2𝑦 + 𝑧 = 0 in ℝ³</div>` : null}

    <div class="ws-layer" style=${this.wsLayerStyle(v.wsAnim)}>
    ${v.eqSign ? html`<div aria-hidden="true" style=${`position: absolute; left: ${v.eqSign.x}px; top: ${v.eqSign.y}px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 40px; color: #E2E8F0; pointer-events: none`}>=</div>` : null}
    ${(v.boxes || []).map(b => html`
      <div onPointerDown=${b.down} aria-label=${b.aria} style=${`position: absolute; left: ${b.x}px; top: ${b.y}px; width: ${b.w}px; height: ${b.h}px; box-sizing: border-box; border-radius: 20px; z-index: ${b.z}; touch-action: none; cursor: grab; animation: ${b.anim};
        border: 2px solid ${b.inv ? '#F2B33D' : 'rgba(148,163,184,0.45)'}; background: ${b.neg ? `linear-gradient(to bottom, rgba(255,255,255,0.03) 50%, ${b.night} 50%)` : 'rgba(255,255,255,0.03)'}`}>
        ${b.inv ? html`<span style="position: absolute; right: 5px; top: 2px; font-family: 'STIX Two Text', serif; font-size: 19px; font-weight: 600; color: #F2B33D">−1</span>` : null}
      </div>`)}
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
      <button onClick=${p.tap} aria-label="Plus. Double-tap to line these terms up" style=${`position: absolute; left: ${p.x}px; top: ${p.y}px; width: 38px; height: 38px; padding: 0; border-radius: 19px; z-index: ${p.z}; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(148,163,184,0.20); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 26px; font-weight: 500; line-height: 34px; text-align: center; opacity: ${p.op}; pointer-events: ${p.pe}; transition: opacity 0.3s ease; cursor: pointer`}>${p.sym || '+'}</button>
    `)}

    ${v.vecs.map(t => this.vecHtml(t))}

    ${v.hexes.map(t => this.hexHtml(t))}

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

    </div>
    ${(v.wsAnim && v.wsAnim.phase === 'swing' ? v.wsAnim.fly : []).map((f, i) => html`
      <div key=${'fly' + i} aria-hidden="true" style=${`position: absolute; left: 0; top: 0; z-index: 980; pointer-events: none; --x0: ${f.x0}px; --x1: ${f.x1}px; animation: wsFlyX 0.52s cubic-bezier(0.45, 0, 0.55, 1) both`}>
        <div style=${`position: absolute; left: 0; top: 0; --y0: ${f.y0}px; --y1: ${f.y1}px; animation: ${i ? 'wsFlyDown' : 'wsFlyUp'} 0.52s cubic-bezier(0.3, 0, 0.3, 1) both; white-space: nowrap`}>
          <div style="font-family: Inter, system-ui, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: #94A3B8">${f.title}</div>
          <div style="margin-top: 6px; padding: 6px 14px; border-radius: 14px; border: 1.5px dashed rgba(148,163,184,0.6); background: rgba(27,37,58,0.92); color: #E2E8F0; font-size: 22px">${f.text}</div>
        </div>
      </div>`)}
    ${v.parenSrc ? html`<button onPointerDown=${v.parenSrc.down} aria-label="Sum space: drag out a pair of brackets" style=${`position: absolute; left: ${v.parenSrc.x}px; top: ${v.parenSrc.y}px; width: 150px; height: 64px; border-radius: 16px; border: 2px dashed rgba(203,213,225,0.55); background: rgba(255,255,255,0.07); color: #E2E8F0; font-size: 30px; touch-action: none; cursor: grab; z-index: ${v.parenSrc.z}; opacity: ${v.parenSrc.op}; pointer-events: ${v.parenSrc.pe}; font-family: inherit`}>( + )</button>` : null}

    ${v.results.map((r) => html`
      <div style=${`opacity: ${v.wsAnim && v.wsAnim.phase === 'swing' ? 0 : 1}; position: absolute; left: ${r.x}px; top: ${r.y}px; max-width: 520px; padding: 8px 16px; border-radius: 14px; background: ${r.bg}; border: 1.5px solid ${r.border}; color: ${r.fg}; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; pointer-events: none; z-index: 950`}>
        <span style="font-size: 24px; font-weight: 600">${r.segs.map(x => x.hot ? html`<span style="animation: readGlow 1.6s ease-in-out infinite">${x.t}</span>` : x.t)}</span>
        <span style="font-family: Inter, system-ui, sans-serif; font-size: 15px; font-weight: 500">${r.note}</span>
      </div>
    `)}
    ${v.flashes.map((r) => html`
      <div style=${`position: absolute; left: ${r.x}px; top: ${r.y}px; max-width: 480px; padding: 8px 16px; border-radius: 14px; background: ${r.bg}; border: 1.5px solid ${r.border}; color: ${r.fg}; font-family: Inter, system-ui, sans-serif; font-size: 18px; font-weight: 600; pointer-events: none; z-index: 960`}>${r.text}</div>
    `)}

  </div>
  <div style=${`position: absolute; left: 0; top: 0; width: 560px; height: ${v.overlayH}px; transform: scale(${v.baseScale}); transform-origin: 0 0; pointer-events: none; z-index: 20`}>
    <div style="position: absolute; right: 18px; bottom: 108px; display: flex; flex-direction: column; gap: 10px; pointer-events: auto">
      <button onClick=${v.zoomIn} aria-label="Zoom in" style="width: 60px; height: 60px; border-radius: 30px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 30px; line-height: 1; cursor: pointer">+</button>
      <button onClick=${v.zoomOut} aria-label="Zoom out" style="width: 60px; height: 60px; border-radius: 30px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 30px; line-height: 1; cursor: pointer">−</button>
    </div>
    ${v.showReset ? html`
      <button onClick=${v.zoomReset} style="position: absolute; right: 18px; bottom: 254px; height: 52px; padding: 0 18px; border-radius: 26px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 18px; font-weight: 600; pointer-events: auto; cursor: pointer">${v.zoomPct}% · Reset</button>
    ` : null}
    ${v.tray && !v.tray.open ? html`
      <button onClick=${v.tray.toggle} aria-label="Open the tray" style="position: absolute; left: 18px; bottom: 108px; height: 60px; padding: 0 22px; border-radius: 30px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font-family: Inter, system-ui, sans-serif; font-size: 20px; font-weight: 600; cursor: pointer; pointer-events: auto">Tray</button>
    ` : null}
    ${v.tray && v.tray.show ? html`
      <div role="dialog" aria-label="Tray" style=${`position: absolute; left: ${v.tray.tools ? 0 : 16}px; top: ${v.tray.top}px; width: ${v.tray.tools ? 560 : 528}px; height: ${v.tray.h}px; box-sizing: border-box; border-radius: ${v.tray.tools ? 0 : 22}px; background: ${v.tray.tools ? '#FFFFFF' : 'rgba(27,37,58,0.98)'}; border: 1.5px solid ${v.tray.tools ? '#E2E8F0' : 'rgba(255,255,255,0.14)'}; box-shadow: 0 10px 30px rgba(0,0,0,0.5); pointer-events: auto; z-index: 1000; font-family: Inter, system-ui, sans-serif; overflow: hidden;
        transition: top 0.22s cubic-bezier(0.3, 0.9, 0.4, 1), height 0.22s cubic-bezier(0.3, 0.9, 0.4, 1), left 0.22s ease, width 0.22s ease, border-radius 0.22s ease, background-color 0.22s ease; animation: ${v.tray.closing ? 'trayDown 0.22s ease-in both' : 'trayUp 0.28s cubic-bezier(0.2, 0.9, 0.3, 1) both'}`}>
        <div style="display: flex; align-items: center; gap: 8px; padding: 12px 12px 0 14px">
          ${['tray', 'lean', 'tools'].map(tab => html`
            <button onClick=${v.tray.pick(tab)} aria-pressed=${v.tray.tab === tab ? 'true' : 'false'} style=${`height: 42px; padding: 0 18px; border-radius: 21px; transition: all 0.22s ease; border: 1.5px solid ${v.tray.tab === tab ? (v.tray.tools ? '#1E3A8A' : '#F2B33D') : (v.tray.tools ? '#CBD5E1' : 'rgba(203,213,225,0.3)')}; background: ${v.tray.tab === tab ? (v.tray.tools ? '#DBEAFE' : 'rgba(242,179,61,0.16)') : 'transparent'}; color: ${v.tray.tools ? (v.tray.tab === tab ? '#1E3A8A' : '#475569') : v.tray.tab === tab ? '#F2B33D' : '#CBD5E1'}; font: inherit; font-size: 17px; font-weight: 700; letter-spacing: 0.06em; cursor: pointer`}>${tab.toUpperCase()}</button>
          `)}
          <span style="flex: 1"></span>
          <button onClick=${v.tray.toggle} aria-label="Close the tray" style="width: 42px; height: 42px; border-radius: 21px; border: 1.5px solid rgba(203,213,225,0.3); background: transparent; color: #CBD5E1; font: inherit; font-size: 22px; line-height: 1; cursor: pointer">×</button>
        </div>
        ${v.tray.tab === 'tray' ? html`
          <div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none">
            <div style="pointer-events: auto">${v.tray.list.map(x => x.kind === 'hex' ? this.hexHtml(x.t) : this.vecHtml(x.t))}</div>
            ${v.tray.hyps.map(h => html`<button onPointerDown=${h.down} aria-label=${'Hypothesis ' + h.text + ': drag it onto either side on the board'} style=${`position: absolute; left: ${h.x}px; top: ${h.y}px; height: 48px; padding: 0 16px; border-radius: 14px; border: 1.5px solid #7DD3FC; background: rgba(14,116,144,0.25); color: #E0F2FE; font-family: 'STIX Two Text', serif; font-size: 21px; white-space: nowrap; touch-action: none; cursor: grab; pointer-events: auto`}>${h.text}</button>`)}
            ${v.tray.tree ? this.treeHtml(v.tray.tree) : null}
            <div style=${`position: absolute; left: 22px; right: 20px; top: ${v.tray.captionY}px; font-size: 14px; line-height: 19px; color: #94A3B8`}>Tap a tile on the board to see its group as a tree · tap a tree node to negate or invert it · drag a node out onto a matching 0 (or 1) to split it</div>
          </div>
        ` : v.tray.tab === 'tools' ? html`
          <div style=${`position: absolute; left: 0; right: 0; top: 64px; bottom: 0; overflow: hidden; border-top: 1px solid #E2E8F0`}>
            <div style=${`width: 390px; height: ${(v.tray.h - 64) * 390 / 560}px; transform: scale(${560 / 390}); transform-origin: 0 0`}>
              <${ConceptGraph} onPlay=${v.tray.play} onStart=${id => this.switchLevel(id)} done=${this.prog.done} active=${this.state.level} levels=${Object.keys(LEVELS)} />
            </div>
          </div>
        ` : html`
          ${this.leanHtml(v.tray.lean)}
        `}
      </div>
    ` : null}
  </div>
  ${v.hist ? html`
    <div style="position: absolute; left: 12px; top: 12px; right: 12px; display: flex; align-items: flex-start; gap: 8px; z-index: 10; pointer-events: none">
      <div style="pointer-events: auto; min-width: 0; flex: 0 1 auto">${this.props.lean ? html`<${LeanPlay} lean=${this.props.lean} inline=${true} />` : null}</div>
      ${[['rewind', 'Back to the start', v.hist.canUndo, v.hist.rewind, 'M7 6v12M19 6l-9 6 9 6z'], ['undo', 'Undo', v.hist.canUndo, v.hist.undo, 'M15 6l-7 6 7 6'], ['redo', 'Redo', v.hist.canRedo, v.hist.redo, 'M9 6l7 6-7 6']].map(([k, label, on, fn, d]) => html`
        <button key=${k} onClick=${on ? fn : null} disabled=${!on} aria-label=${label} style=${`pointer-events: auto; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 22px; border: 1.5px solid rgba(203,213,225,${on ? 0.45 : 0.2}); background: rgba(27,37,58,0.94); color: ${on ? '#E2E8F0' : '#475569'}; display: flex; align-items: center; justify-content: center; cursor: ${on ? 'pointer' : 'default'}; transition: color 0.2s ease, border-color 0.2s ease`}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d=${d} fill=${k === 'rewind' ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </button>`)}
    </div>` : null}
</div>
`;
  }
}
