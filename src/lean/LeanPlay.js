// The Play button and Lean's status, over the board (PROTOTYPE, written by Claude). See client.js.
import { Component } from '../../vendor/preact.mjs';
import { html } from '../html.js';
import { createLean } from './client.js';

const LABEL = {
  asleep: 'Play with Lean',
  starting: 'Waking Lean…',
  booting: 'Lean is starting…',
  ready: 'Lean is ready',
  capped: 'Lean is resting',
  off: 'Lean is off',
  offline: 'Lean is offline',
  error: 'Lean had a problem',
};
const DOT = { ready: '#34D399', starting: '#F2B33D', booting: '#F2B33D', error: '#F87171' };

export class LeanPlay extends Component {
  constructor(props) {
    super(props);
    this.state = { s: { state: 'asleep' } };
    this.lean = props.lean || createLean();
    this.unsub = this.lean.subscribe((s) => this.setState({ s }));
    this.onActivity = () => this.lean.touch();
    this.play = () => {
      const st = this.state.s.state;
      if (st === 'asleep' || st === 'error' || st === 'offline') this.lean.wake();
      else if (st === 'ready' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('leangame:lean')); // watch the live proof
    };
  }

  componentDidMount() {
    window.addEventListener('pointerdown', this.onActivity, true);
    this.lean.poll(); // maybe someone already woke it
  }

  componentWillUnmount() {
    window.removeEventListener('pointerdown', this.onActivity, true);
    if (this.unsub) this.unsub();
    this.lean.stop();
  }

  render() {
    const s = this.state.s;
    const busy = s.state === 'starting' || s.state === 'booting';
    const canPress = !busy && s.state !== 'capped' && s.state !== 'off';
    const dot = DOT[s.state] || '#94A3B8';
    const detail = s.state === 'ready' ? 'tap to watch the proof live' : s.detail || '';
    return html`
<div style="position: absolute; left: 12px; top: 12px; max-width: calc(100% - 24px); z-index: 1000; font-family: Inter, system-ui, sans-serif">
  <button onClick=${this.play} disabled=${!canPress} aria-live="polite"
    style=${`display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 14px; border-radius: 22px; border: 1.5px solid rgba(203,213,225,0.45); background: rgba(27,37,58,0.94); color: #E2E8F0; font: inherit; font-size: 15px; font-weight: 600; text-align: left; cursor: ${canPress ? 'pointer' : 'default'}`}>
    <span aria-hidden="true" style=${`flex: 0 0 auto; width: 10px; height: 10px; border-radius: 5px; background: ${dot}; ${busy ? 'animation: leanPulse 1.2s ease-in-out infinite' : ''}`}></span>
    <span style="display: flex; flex-direction: column">
      <span>${canPress && s.state === 'asleep' ? '▶ ' : ''}${LABEL[s.state] || s.state}</span>
      ${detail ? html`<span style="font-size: 12px; font-weight: 500; color: #94A3B8">${detail}</span>` : null}
    </span>
  </button>
</div>`;
  }
}
