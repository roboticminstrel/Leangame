// Levels and the player's progress (PROTOTYPE, written by Claude).
//
// A level is a result of the book with a game: a start expression and a goal. Winning it marks the node done in the
// concept graph, which can make new nodes one step away (and so playable), and unlocks the result as a move in later
// levels (1.30: 0·𝑣 becomes 0). Progress and each level's place (its move history and where in it the player is)
// are kept in the browser (localStorage), so leaving a level and coming back resumes it.

// A level: build(R) gives its start (top-level terms), goal, and optionally hyps (hypotheses: { name (Lean, h1…),
// label (shown), lhs, rhs } with each side a list of terms, a run in a sum), vars (the vectors it declares, for
// ASSUMPTIONS) and scalars (symbolic scalars it declares, [shown, field]).
export const LEVELS = {
  '1.26': {
    id: '1.26', name: 'unique 0',
    // 0′ is another additive identity: h says 𝑣 + 0′ = 𝑣 for every 𝑣 (a ∀ hypothesis: its 𝑣 matches any vector)
    build: R => {
      const O = () => R.mkV('𝑉', '0′', 'o', 'R', 120), Z = () => R.mkV('𝑉', '0', 'zero', 'R', 110);
      const P = () => Object.assign(R.mkV('𝑉', '𝑣', 'v', 'R', 140), { pat: true });
      return {
        start: [O()], goal: Z(),
        vars: [['0′', 'o']],
        hyps: [{ name: 'h1', label: 'h', bind: 'v', forall: '∀𝑣 : 𝑉, ', lhs: [P(), O()], rhs: [P()] }],
      };
    },
  },
  '1.27': {
    id: '1.27', name: 'unique −𝑣',
    build: R => {
      const V = (k, el) => R.mkV('𝑉', el, k, 'R', 140), Z = () => R.mkV('𝑉', '0', 'zero', 'R', 110);
      return {
        start: [V('w', '𝑤')], goal: V('w2', '𝑤′'),
        vars: [['𝑣', 'v'], ['𝑤', 'w'], ['𝑤′', 'w2']],
        hyps: [{ name: 'h1', label: 'h', lhs: [V('v', '𝑣'), V('w', '𝑤')], rhs: [Z()] },
          { name: 'h2', label: 'h′', lhs: [V('v', '𝑣'), V('w2', '𝑤′')], rhs: [Z()] }],
      };
    },
  },
  '1.30': {
    id: '1.30', name: '0𝑣 = 0',
    build: R => ({ start: [R.mkProd([R.mkS('R', '0', '0')], R.mkV('𝑉', '𝑣', 'v', 'R', 140))], goal: R.mkV('𝑉', '0', 'zero', 'R', 110) }),
  },
  '1.31': {
    id: '1.31', name: '𝑎0 = 0',
    build: R => ({ start: [R.mkProd([R.mkS('R', '𝑎', 'a')], R.mkV('𝑉', '0', 'zero', 'R', 110))], goal: R.mkV('𝑉', '0', 'zero', 'R', 110), scalars: [['𝑎', 'ℝ']] }),
  },
  '1.32': {
    id: '1.32', name: '(−1)𝑣 = −𝑣',
    build: R => ({ start: [R.mkProd([R.mkS('R', '−1', '-1')], R.mkV('𝑉', '𝑣', 'v', 'R', 140))], goal: Object.assign(R.mkV('𝑉', '𝑣', 'v', 'R', 140), { neg: true }) }),
  },
};
// 1.34 (conditions for a subspace): one level, twelve goals, each played like a level of its own ('1.34/1' …). ⇒:
// from h (U is a subspace in the book's sense, 1.33) the three conditions; ⇐: from the three conditions, the laws
// that make U a vector space. Membership goals (x ∈ U) are played on rows, one per open goal, with cards: a fact
// (hu : u ∈ U) closes a row, hs (closed under ·) turns a·x into x, ha (closed under +) splits x + y into two rows.
// Associativity (of + and of ·) isn't a goal: the board treats sums and products as one chain already.
const V34 = (R, k, el) => R.mkV('𝑉', el, k, 'R', 140);
const card = (name, kind, text, more) => Object.assign({ name: name, label: name, kind: kind, text: text }, more || {});
const facts = (R, ks) => ks.map(([k, el]) => card('h' + k, 'fact', 'h' + k + ' : ' + el + ' ∈ 𝑈', { node: V34(R, k, el) }));
const SUB = R => [card('h', 'subspace', 'h : 𝑈 is a subspace of 𝑉')];
const CLOSED = R => [card('h0', 'fact', 'h0 : 0 ∈ 𝑈', { node: R.mkV('𝑉', '0', 'zero', 'R', 110) }),
  card('ha', 'split', 'ha : ∀𝑥 𝑦 ∈ 𝑈, 𝑥 + 𝑦 ∈ 𝑈'), card('hs', 'drop', 'hs : ∀𝑎 : 𝐅, ∀𝑥 ∈ 𝑈, 𝑎𝑥 ∈ 𝑈')];
// 1.32, won before 1.34: a card for its equation (∀𝑣 : 𝑉, (−1)𝑣 = −𝑣), a move like a hypothesis but a law in Lean
const C132 = R => { const P = () => Object.assign(V34(R, 'v', '𝑣'), { pat: true });
  return card('1.32', 'eq', null, { law: 'neg_one_smul', bind: 'v', forall: '∀𝑣 : 𝑉, ', lhs: [R.mkProd([R.mkS('R', '−1', '-1')], P())], rhs: [Object.assign(P(), { neg: true })] }); };
const U = ['𝑢', 'u'], W = ['𝑤', 'w'];
const G34 = [
  // ⇒: h : U is a subspace (1.33)
  { side: '⇒', text: '0 ∈ 𝑈', ctx: 'subspace', build: R => ({ start: [R.mkV('𝑉', '0', 'zero', 'R', 110)], hyps: SUB(R) }) },
  { side: '⇒', text: '𝑢 + 𝑤 ∈ 𝑈', ctx: 'subspace', mems: [U, W], build: R => ({ start: [V34(R, 'u', '𝑢'), V34(R, 'w', '𝑤')], hyps: SUB(R).concat(facts(R, [['u', '𝑢'], ['w', '𝑤']])) }) },
  { side: '⇒', text: '𝑎𝑢 ∈ 𝑈', ctx: 'subspace', mems: [U], scalars: [['𝑎', 'ℝ']], build: R => ({ start: [R.mkProd([R.mkS('R', '𝑎', 'a')], V34(R, 'u', '𝑢'))], hyps: SUB(R).concat(facts(R, [['u', '𝑢']])) }) },
  // ⇐: the three conditions
  { side: '⇐', text: '0 ∈ 𝑈', ctx: 'closed', build: R => ({ start: [R.mkV('𝑉', '0', 'zero', 'R', 110)], hyps: CLOSED(R) }) },
  { side: '⇐', text: '𝑢 + 𝑤 ∈ 𝑈', ctx: 'closed', mems: [U, W], build: R => ({ start: [V34(R, 'u', '𝑢'), V34(R, 'w', '𝑤')], hyps: CLOSED(R).concat(facts(R, [['u', '𝑢'], ['w', '𝑤']])) }) },
  { side: '⇐', text: '𝑎𝑢 ∈ 𝑈', ctx: 'closed', mems: [U], scalars: [['𝑎', 'ℝ']], build: R => ({ start: [R.mkProd([R.mkS('R', '𝑎', 'a')], V34(R, 'u', '𝑢'))], hyps: CLOSED(R).concat(facts(R, [['u', '𝑢']])) }) },
  { side: '⇐', text: '−𝑢 ∈ 𝑈', ctx: 'closed', mems: [U], build: R => ({ start: [Object.assign(V34(R, 'u', '𝑢'), { neg: true })], hyps: CLOSED(R).concat(facts(R, [['u', '𝑢']]), [C132(R)]) }) },
  { side: '⇐', text: '𝑢 + 𝑤 = 𝑤 + 𝑢', vars: [U, W], ordered: true, build: R => ({ start: [V34(R, 'u', '𝑢'), V34(R, 'w', '𝑤')], goal: R.mkSum([{ node: V34(R, 'w', '𝑤'), x: 0, y: 0 }, { node: V34(R, 'u', '𝑢'), x: 0, y: 0 }]) }) },
  { side: '⇐', text: '𝑢 + 0 = 𝑢', vars: [U], build: R => ({ start: [V34(R, 'u', '𝑢'), R.mkV('𝑉', '0', 'zero', 'R', 110)], goal: V34(R, 'u', '𝑢') }) },
  { side: '⇐', text: '1𝑢 = 𝑢', vars: [U], build: R => ({ start: [R.mkProd([R.mkS('R', '1', '1')], V34(R, 'u', '𝑢'))], goal: V34(R, 'u', '𝑢') }) },
  { side: '⇐', text: '𝑎(𝑢 + 𝑤) = 𝑎𝑢 + 𝑎𝑤', vars: [U, W], scalars: [['𝑎', 'ℝ']], ordered: true,
    build: R => ({ start: [R.mkProd([R.mkS('R', '𝑎', 'a')], R.mkSum([{ node: V34(R, 'u', '𝑢'), x: 0, y: 0 }, { node: V34(R, 'w', '𝑤'), x: 160, y: 0 }]))],
      goal: R.mkSum([{ node: R.mkProd([R.mkS('R', '𝑎', 'a')], V34(R, 'u', '𝑢')), x: 0, y: 0 }, { node: R.mkProd([R.mkS('R', '𝑎', 'a')], V34(R, 'w', '𝑤')), x: 0, y: 0 }]) }) },
  { side: '⇐', text: '(𝑎 + 𝑏)𝑢 = 𝑎𝑢 + 𝑏𝑢', vars: [U], scalars: [['𝑎', 'ℝ'], ['𝑏', 'ℝ']], ordered: true,
    build: R => ({ start: [R.mkProd([R.mkSum([{ node: R.mkS('R', '𝑎', 'a'), x: 0, y: 0 }, { node: R.mkS('R', '𝑏', 'b'), x: 110, y: 0 }])], V34(R, 'u', '𝑢'))],
      goal: R.mkSum([{ node: R.mkProd([R.mkS('R', '𝑎', 'a')], V34(R, 'u', '𝑢')), x: 0, y: 0 }, { node: R.mkProd([R.mkS('R', '𝑏', 'b')], V34(R, 'u', '𝑢')), x: 0, y: 0 }]) }) },
];
G34.forEach((g, i) => {
  const id = '1.34/' + (i + 1);
  LEVELS[id] = { id: id, parent: '1.34', idx: i, name: g.text, side: g.side, ordered: !!g.ordered,
    build: R => {
      const b = g.build(R);
      const vars = g.vars || g.mems || null;
      return Object.assign({ goal: b.goal || null, vars: vars ? vars.slice() : null, scalars: g.scalars || null, sets: ['𝑈'],
        mem: g.ctx ? { ctx: g.ctx, mems: (g.mems || []).map(m => m[1]), text: g.text } : null, hyps: [] }, b);
    } };
});
export const GOALS = { '1.34': G34.map((g, i) => '1.34/' + (i + 1)) };
// the level a sub-level (one goal of a multi-goal level) belongs to
export const parentOf = id => (LEVELS[id] && LEVELS[id].parent) || id;
export const FIRST = '1.30';
// the book's nodes the player starts with as done (the definitions up to 1.20)
export const START_DONE = ['1.1', '1.3', '1.6', '1.8', '1.11', '1.13', '1.18', '1.14', '1.19', '1.20'];

const KEY = 'leangame.progress.v1';

// A store keeps { done: [ids], current: id, places: { id: { entries, idx } } }. memoryStore is for tests.
export function memoryStore(init) {
  let data = init || null;
  return { load: () => data, save: d => { data = JSON.parse(JSON.stringify(d)); } };
}
export function browserStore() {
  return {
    load: () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    save: d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode, full: progress just isn't kept */ } },
  };
}
export function progressFrom(store) {
  const d = store.load() || {};
  let done = Array.isArray(d.done) ? d.done : START_DONE.slice();
  // progress saved before 1.27 had a level started with it marked done, unearned: take that back (once)
  if (!d.v || d.v < 2) done = done.filter(id => id !== '1.27');
  return { v: 2, done: done, current: LEVELS[d.current] ? d.current : FIRST, places: d.places || {} };
}
