// Levels and the player's progress (PROTOTYPE, written by Claude).
//
// A level is a result of the book with a game: a start expression and a goal. Winning it marks the node done in the
// concept graph, which can make new nodes one step away (and so playable), and unlocks the result as a move in later
// levels (1.30: 0·𝑣 becomes 0). Progress and each level's place (its move history and where in it the player is)
// are kept in the browser (localStorage), so leaving a level and coming back resumes it.

export const LEVELS = {
  '1.30': {
    id: '1.30', name: '0𝑣 = 0',
    build: R => ({ start: [R.mkProd([R.mkS('R', '0', '0')], R.mkV('𝑉', '𝑣', 'v', 'R', 140))], goal: R.mkV('𝑉', '0', 'zero', 'R', 110) }),
  },
  '1.32': {
    id: '1.32', name: '(−1)𝑣 = −𝑣',
    build: R => ({ start: [R.mkProd([R.mkS('R', '−1', '-1')], R.mkV('𝑉', '𝑣', 'v', 'R', 140))], goal: Object.assign(R.mkV('𝑉', '𝑣', 'v', 'R', 140), { neg: true }) }),
  },
};
export const FIRST = '1.30';
// the book's nodes the player starts with as done (definitions read, 1.27 proved in Lean already)
export const START_DONE = ['1.1', '1.3', '1.6', '1.8', '1.11', '1.13', '1.18', '1.14', '1.19', '1.20', '1.27'];

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
  return { done: Array.isArray(d.done) ? d.done : START_DONE.slice(), current: LEVELS[d.current] ? d.current : FIRST, places: d.places || {} };
}
