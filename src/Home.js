// The first screen (PROTOTYPE, written by Claude): on every visit or reload, choose a game. The Natural Number Game
// (Lean 4, leanprover-community/NNG4) runs as the hosted version at adam.math.hhu.de, in a frame, for now; Linear
// Algebra is the Range (src/range/Range.js).
import { Component } from '../vendor/preact.mjs';
import { html } from './html.js';
import { Range } from './range/Range.js';

export const NNG_URL = 'https://adam.math.hhu.de/#/g/leanprover-community/nng4';

export class Home extends Component {
  constructor(props) {
    super(props);
    this.state = { game: null };
    this.pick = game => () => this.setState({ game });
  }

  render() {
    const g = this.state.game;
    if (g === 'la') return html`<div style="position: relative; width: 100%; height: 100%"><${Range} lean=${this.props.lean} /></div>`;
    if (g === 'nng') return html`
<div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; background: #121A2B">
  <div style="flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-family: Inter, system-ui, sans-serif">
    <button onClick=${this.pick(null)} aria-label="Back to the choice of games"
      style="height: 40px; padding: 0 16px; border-radius: 20px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer">‹ Games</button>
    <span style="flex: 1; color: #CBD5E1; font-size: 15px; font-weight: 600">Natural Number Game</span>
    <a href=${NNG_URL} target="_blank" rel="noopener" style="color: #93C5FD; font-size: 13px">Open in a new tab</a>
  </div>
  <iframe src=${NNG_URL} title="Natural Number Game" allow="clipboard-read; clipboard-write"
    style="flex: 1 1 auto; width: 100%; border: 0; background: #FFFFFF"></iframe>
</div>`;
    const card = (key, title, sub, accent) => html`
      <button onClick=${this.pick(key)} style=${`display: block; width: 100%; text-align: left; padding: 22px 20px; border-radius: 20px; border: 1.5px solid ${accent}; background: rgba(27,37,58,0.94); color: #E2E8F0; font: inherit; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,0.35)`}>
        <div style=${`font-size: 22px; font-weight: 700; color: ${accent}`}>${title}</div>
        <div style="margin-top: 6px; font-size: 15px; line-height: 21px; color: #CBD5E1">${sub}</div>
      </button>`;
    return html`
<div style="width: 100%; height: 100%; overflow: auto; background-color: #121A2B; background-image: radial-gradient(rgba(148,163,184,0.22) 1.4px, transparent 2px); background-size: 30px 30px; font-family: Inter, system-ui, sans-serif">
  <div style="max-width: 460px; margin: 0 auto; padding: 56px 20px 32px; display: flex; flex-direction: column; gap: 18px">
    <div style="font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: #94A3B8">LEANGAME</div>
    <div style="font-size: 28px; font-weight: 700; color: #F8FAFC; margin-bottom: 8px">Choose a game</div>
    ${card('nng', 'Natural Number Game', 'Build ℕ from zero and succ, and prove 2 + 2 = 4, x + y = y + x and on, one Lean tactic at a time.', '#93C5FD')}
    ${card('la', 'Linear Algebra', 'The Range: Axler’s vector spaces as tiles; every move is an axiom, checked by Lean.', '#F2B33D')}
  </div>
</div>`;
  }
}
