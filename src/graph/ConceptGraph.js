// The Tools tab: the chapter's concept graph, in the style of the design canvas (PROTOTYPE, written by Claude).
// Laid out at phone width (390 units, like the canvas) and scaled by the caller. Nodes up to where the player is are
// filled in (definitions navy, results white with an orange edge); the one being worked on has a glow running
// round its edge, and tapping it goes back to the game. Tapping any other node opens its explanation sheet: the
// book's statement, then its commentary.
import { Component } from '../../vendor/preact.mjs';
import { html } from '../html.js';
import { NODES } from './data.js';

const COLS = [68, 195, 322];
const CH = 40;
const rowY = r => 52 + r * 58 + (r <= 4 ? 0 : r <= 8 ? 1 : 2) * 34;
const BANDS = [['1A · 𝐑ⁿ AND 𝐂ⁿ', 0, 4, '#EEF2F7'], ['1B · DEFINITION OF VECTOR SPACE', 5, 8, '#FFFFFF'], ['1C · SUBSPACES', 9, 13, '#EEF2F7']];
export const ACTIVE = '1.30';
// filled in: everything before the active node except what's still ahead of it (1.27 is proved already)
export const DONE = new Set(['1.1', '1.3', '1.6', '1.8', '1.11', '1.13', '1.18', '1.14', '1.19', '1.20', '1.27']);

export function nodeState(id) { return id === ACTIVE ? 'active' : DONE.has(id) ? 'done' : 'ahead'; }

export class ConceptGraph extends Component {
  constructor(props) {
    super(props);
    this.state = { sel: null };
  }

  tap(n) {
    if (n.id === ACTIVE) { this.setState({ sel: null }); if (this.props.onPlay) this.props.onPlay(); return; }
    this.setState({ sel: n.id });
  }

  render() {
    const byId = {}; NODES.forEach(n => { byId[n.id] = n; });
    const sel = this.state.sel && byId[this.state.sel];
    const H = rowY(13) + CH + 60;
    const edges = [];
    NODES.forEach(n => n.deps.forEach(d => {
      const a = byId[d]; if (!a) return;
      const ahead = nodeState(n.id) === 'ahead';
      edges.push({ x1: COLS[a.col], y1: rowY(a.row) + CH, x2: COLS[n.col], y2: rowY(n.row), color: ahead ? '#E2E8F0' : '#94A3B8', dash: ahead ? '4 4' : 'none' });
    }));
    const look = n => {
      const st = nodeState(n.id); const def = n.kind === 'def';
      if (st === 'ahead') return { bg: '#F8FAFC', fg: '#94A3B8', idFg: '#CBD5E1', border: '1.5px dashed #CBD5E1' };
      if (def) return { bg: '#1E3A8A', fg: '#FFFFFF', idFg: '#BFDBFE', border: '1.5px solid #1E3A8A' };
      return { bg: '#FFFFFF', fg: '#7C2D12', idFg: '#C2410C', border: '1.5px solid #EA580C' };
    };
    const pill = n => n.kind === 'def' ? { bg: '#DBEAFE', fg: '#1E3A8A', label: n.label || 'Definition', box: '#F8FAFF', boxB: '#C7D7F2' }
      : { bg: '#FFEDD5', fg: '#9A3412', label: 'Result', box: '#FFFBF5', boxB: '#F3D2B3' };
    const block = ([k, s]) => k === 'eq' ? html`<div style="font-family: 'STIX Two Text', serif; font-size: 17px; text-align: center; padding: 4px 0">${s}</div>`
      : k === 'h' ? html`<div style="font-size: 13px; font-weight: 700; color: #334155; margin-top: 6px">${s}</div>`
      : k === 'li' ? html`<div style="display: flex; gap: 8px"><span aria-hidden="true">•</span><span>${s}</span></div>`
      : k === 'pr' ? html`<div><i style="font-weight: 600">Proof. </i>${s}</div>`
      : k === 'note' ? html`<div style="font-size: 13px; color: #475569; border-left: 3px solid #CBD5E1; padding-left: 10px">${s}</div>`
      : html`<div>${s}</div>`;
    const p = sel ? pill(sel) : null;
    return html`
<div style="position: relative; width: 390px; height: 100%; background: #F8FAFC; color: #0F172A; font-family: Inter, system-ui, sans-serif">
  <div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; overflow: auto">
    <div style=${`position: relative; width: 390px; height: ${H}px`}>
      ${BANDS.map(([label, r0, r1, bg]) => html`
        <div style=${`position: absolute; left: 0; right: 0; top: ${rowY(r0) - 40}px; height: ${rowY(r1) + CH + 12 - rowY(r0) + 40}px; background: ${bg}`}>
          <div style="position: absolute; left: 16px; top: 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #64748B">${label}</div>
        </div>`)}
      <svg width="390" height=${H} style="position: absolute; left: 0; top: 0; pointer-events: none" aria-hidden="true">
        ${edges.map(e => html`<line x1=${e.x1} y1=${e.y1} x2=${e.x2} y2=${e.y2} stroke=${e.color} stroke-width="1.5" stroke-dasharray=${e.dash}></line>`)}
      </svg>
      ${NODES.map(n => {
        const L = look(n); const active = n.id === ACTIVE; const on = this.state.sel === n.id;
        const card = html`<button onClick=${() => this.tap(n)} aria-label=${n.id + ' ' + n.title + (active ? ': being worked on, tap to play' : ': tap for the explanation')}
          style=${`position: absolute; left: ${active ? 2 : 0}px; top: ${active ? 2 : 0}px; width: ${active ? 108 : 112}px; height: ${active ? 36 : 40}px; box-sizing: border-box; padding: 0 8px; border-radius: ${active ? 8 : 10}px; border: ${active ? 'none' : L.border}; background: ${L.bg}; color: ${L.fg}; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; cursor: pointer; outline: ${on ? '3px solid #F59E0B' : 'none'}; outline-offset: 2px`}>
          <span style=${`font-size: 10px; font-weight: 700; color: ${L.idFg}; line-height: 12px`}>${n.id}</span>
          <span style="font-size: 12px; font-weight: 600; line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%">${n.name}</span>
        </button>`;
        return html`<div style=${`position: absolute; left: ${COLS[n.col] - 56}px; top: ${rowY(n.row)}px; width: 112px; height: 40px; border-radius: 10px; ${active ? 'background: conic-gradient(from var(--glowA), #EA580C 0 62%, #FDE68A 76%, #F59E0B 84%, #EA580C 96%); animation: glowSpin 2.4s linear infinite; box-shadow: 0 0 14px rgba(245,158,11,0.45)' : ''}`}>${card}</div>`;
      })}
    </div>
  </div>
  ${sel ? html`
    <div role="dialog" aria-label=${sel.id + ' ' + sel.title} style="position: absolute; left: 0; right: 0; bottom: 0; height: 64%; background: #FFFFFF; border-radius: 18px 18px 0 0; box-shadow: 0 -8px 24px rgba(15,23,42,0.18); display: flex; flex-direction: column; animation: trayUp 0.25s cubic-bezier(0.2, 0.9, 0.3, 1) both">
      <div style="flex: 0 0 auto; display: flex; align-items: flex-start; gap: 10px; padding: 16px 16px 10px">
        <div style="flex: 1 1 auto; display: flex; flex-direction: column; gap: 6px">
          <span style="display: flex; gap: 8px; align-items: center">
            <span style=${`font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: ${p.bg}; color: ${p.fg}`}>${p.label}</span>
            <span style="font-size: 13px; font-weight: 600; color: #475569">${sel.id} · ${sel.sec}</span>
            ${nodeState(sel.id) === 'ahead' ? html`<span style="font-size: 12px; color: #94A3B8">not reached yet</span>` : null}
          </span>
          <span style="font-size: 19px; font-weight: 700; line-height: 24px">${sel.title}</span>
        </div>
        <button onClick=${() => this.setState({ sel: null })} aria-label="Close the explanation" style="flex: 0 0 auto; width: 40px; height: 40px; border-radius: 20px; border: 1px solid #E2E8F0; background: #FFFFFF; color: #334155; font-size: 22px; line-height: 1; cursor: pointer">×</button>
      </div>
      <div style="flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 16px 20px; display: flex; flex-direction: column; gap: 12px; font-size: 15px; line-height: 22px">
        <div style=${`display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: ${p.box}; border: 1px solid ${p.boxB}`}>${sel.f.map(block)}</div>
        ${sel.c.map(block)}
      </div>
    </div>` : null}
</div>`;
  }
}
