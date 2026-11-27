// The first screen (PROTOTYPE, written by Claude): on every visit or reload, choose a game. Linear Algebra is the
// Range (src/range/Range.js). The Natural Number Game runs on our own Lean machine (nng/, lean4game, set up by
// scripts/nng-server.sh): choosing it wakes the machine, shows how far it is, and frames nng.lean.interlinea.io once
// the game server is ready. The hosted version (adam.math.hhu.de) is there to fall back on.
import { Component } from '../vendor/preact.mjs';
import { html } from './html.js';
import { Range } from './range/Range.js';

export const NNG_URL = 'https://nng.lean.interlinea.io/g/leangame/nng';
export const NNG_HOSTED_URL = 'https://adam.math.hhu.de/#/g/leanprover-community/nng4';

// Where the Natural Number Game is, from the Lean machine's status (the gate's `nng`: the game server's progress)
export function nngView(status, hosted) {
  if (hosted) return { frame: NNG_HOSTED_URL, note: 'the hosted version (adam.math.hhu.de)' };
  const st = status || { state: 'asleep' };
  if (st.state === 'ready') {
    const n = st.nng;
    if (n === undefined) return { frame: NNG_HOSTED_URL, note: 'the hosted version: the Lean machine can’t serve the game yet' };
    if (n === null) return { wait: 'The Lean machine doesn’t have the game yet (it comes with the next start)', fallback: true };
    if (n.state === 'ready') return { frame: NNG_URL, note: 'on our Lean machine' };
    if (n.state === 'failed') return { wait: n.detail || 'The game didn’t build', fallback: true, bad: true };
    return { wait: n.detail || 'Setting up the Natural Number Game…', busy: true, fallback: true };
  }
  const words = { asleep: 'Waking the Lean machine…', starting: 'Starting the Lean machine…', booting: st.detail || 'The Lean machine is starting…',
    capped: st.detail || 'Lean has started too often today', off: 'The Lean machine is switched off', offline: st.detail || 'Lean isn’t reachable', error: st.detail || 'Lean had a problem' };
  const stuck = ['capped', 'off', 'offline', 'error'].includes(st.state);
  return { wait: words[st.state] || st.state, busy: !stuck, fallback: true, bad: stuck };
}

export class Home extends Component {
  constructor(props) {
    super(props);
    this.state = { game: null, lean: props.lean ? props.lean.status : null, hosted: false };
    this.pick = game => () => {
      this.setState({ game, hosted: false });
      if (game === 'nng') this.wakeForNng();
    };
  }

  componentDidMount() {
    const L = this.props.lean; if (!L) return;
    this._unsub = L.subscribe(s => this.setState({ lean: s }));
  }
  componentWillUnmount() { if (this._unsub) this._unsub(); clearInterval(this._poll); }

  // wake the machine (if it's asleep) and, while the game server is getting ready, ask often how far it is
  wakeForNng() {
    const L = this.props.lean; if (!L) return;
    const st = (L.status || {}).state;
    if (st === 'asleep' || st === 'offline' || st === 'error' || !st) L.wake();
    clearInterval(this._poll);
    this._poll = setInterval(() => {
      const s = L.status || {};
      if (this.state.game !== 'nng' || (s.state === 'ready' && s.nng && (s.nng.state === 'ready' || s.nng.state === 'failed'))) { clearInterval(this._poll); return; }
      if (s.state === 'ready') L.poll();
    }, 5000);
  }

  render() {
    const g = this.state.game;
    if (g === 'la') return html`<div style="position: relative; width: 100%; height: 100%"><${Range} lean=${this.props.lean} /></div>`;
    if (g === 'nng') {
      const v = nngView(this.state.lean, this.state.hosted);
      return html`
<div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; background: #121A2B; font-family: Inter, system-ui, sans-serif">
  <div style="flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 8px 12px">
    <button onClick=${this.pick(null)} aria-label="Back to the choice of games"
      style="height: 40px; padding: 0 16px; border-radius: 20px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer">‹ Games</button>
    <span style="flex: 1; min-width: 0; display: flex; flex-direction: column">
      <span style="color: #CBD5E1; font-size: 15px; font-weight: 600">Natural Number Game</span>
      ${v.note ? html`<span style="color: #94A3B8; font-size: 12px">${v.note}</span>` : null}
    </span>
    ${v.frame ? html`<a href=${v.frame} target="_blank" rel="noopener" style="color: #93C5FD; font-size: 13px">Open in a new tab</a>` : null}
  </div>
  ${v.frame ? html`<iframe key=${v.frame} src=${v.frame} title="Natural Number Game" allow="clipboard-read; clipboard-write" style="flex: 1 1 auto; width: 100%; border: 0; background: #FFFFFF"></iframe>` : html`
  <div style="flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 24px; text-align: center">
    <div style="display: flex; align-items: center; gap: 12px; color: ${v.bad ? '#FCA5A5' : '#E2E8F0'}; font-size: 17px; font-weight: 600">
      <span aria-hidden="true" style=${`width: 12px; height: 12px; border-radius: 6px; background: ${v.bad ? '#F87171' : '#F2B33D'}; ${v.busy ? 'animation: leanPulse 1.2s ease-in-out infinite' : ''}`}></span>
      <span aria-live="polite">${v.wait}</span>
    </div>
    ${v.busy ? html`<div style="color: #94A3B8; font-size: 14px; max-width: 340px; line-height: 20px">The game runs on our own Lean machine. It starts when you need it and stops itself after 10 quiet minutes, so the first start takes a few minutes.</div>` : null}
    ${v.fallback ? html`<button onClick=${() => this.setState({ hosted: true })}
      style="height: 42px; padding: 0 18px; border-radius: 21px; border: 1.5px solid rgba(147,197,253,0.6); background: transparent; color: #93C5FD; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer">Play the hosted version meanwhile</button>` : null}
  </div>`}
</div>`;
    }
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
