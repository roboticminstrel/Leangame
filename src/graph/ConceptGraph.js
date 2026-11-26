// The Tools tab: the chapter's concept graph, in the style of the design canvas (PROTOTYPE, written by Claude).
// Laid out at phone width (390 units, like the canvas) and scaled by the caller. Only what the player has reached
// shows: done nodes filled in (definitions navy, results white with an orange edge), the level being played with a
// glow running round its edge, and nodes one step away (every prerequisite done) in grey. Nothing further.
// Tapping a node opens its sheet: the book's statement and commentary, the proof only once the node is done.
//   active level: its introduction, and "Return to level"
//   grey (one step away): "Start level" (when the node has a level), which makes it the active problem
//   done, with a level: "Replay level" (back where the player left it)
import { Component } from '../../vendor/preact.mjs';
import { html } from '../html.js';
import { NODES } from './data.js';

const COLS = [68, 195, 322];
const CH = 40;
const rowY = r => 52 + r * 58 + (r <= 4 ? 0 : r <= 8 ? 1 : 2) * 34;
const BANDS = [['1A · 𝐑ⁿ AND 𝐂ⁿ', 0, 4, '#EEF2F7'], ['1B · DEFINITION OF VECTOR SPACE', 5, 8, '#FFFFFF'], ['1C · SUBSPACES', 9, 13, '#EEF2F7']];
// a node's state for the player: active (being played), done, next (every prerequisite done: playable), partial
// (some prerequisites done, the rest on screen as next or active: shown, not playable yet), or hidden
// Definitions have no level: one counts as done as soon as all its prerequisites are (results need their level won)
export function effectiveDone(done) {
  const eff = new Set(done); let grew = true;
  while (grew) { grew = false; NODES.forEach(n => { if (n.kind === 'def' && !eff.has(n.id) && n.deps.every(d => eff.has(d))) { eff.add(n.id); grew = true; } }); }
  return eff;
}
export function nodeState(id, doneIn, active) {
  const done = effectiveDone(doneIn);
  if (id === active) return 'active';
  if (done.has(id)) return 'done';
  const n = NODES.find(x => x.id === id); if (!n) return 'hidden';
  if (n.deps.every(d => done.has(d))) return 'next';
  const open = d => d === active || (!done.has(d) && (NODES.find(x => x.id === d) || { deps: [null] }).deps.every(e => done.has(e)));
  return n.deps.some(d => done.has(d)) && n.deps.every(d => done.has(d) || open(d)) ? 'partial' : 'hidden';
}
// the statement without its proof: the blocks before the first proof block
// the faded lines toward hidden nodes, for a given progress: [from, to]
export function stubsFor(doneIn, active) {
  const done = effectiveDone(doneIn);
  const st = id => nodeState(id, done, active);
  const out = [];
  NODES.filter(n => st(n.id) === 'hidden').forEach(n => n.deps.forEach(d => { if (done.has(d)) out.push([d, n.id]); }));
  return out;
}
export const withoutProof = f => { const i = f.findIndex(b => b[0] === 'pr'); return i < 0 ? f : f.slice(0, i); };

export class ConceptGraph extends Component {
  constructor(props) {
    super(props);
    this.state = { sel: null, pulse: null };
  }

  // a node still missing prerequisites doesn't open: its dotted lines and the missing nodes pulse twice instead
  tap(n, missing) {
    if (missing && missing.length) {
      this.setState({ sel: null, pulse: { to: n.id, missing: missing, k: ((this.state.pulse && this.state.pulse.k) || 0) + 1 } });
      clearTimeout(this._pt); this._pt = setTimeout(() => this.setState({ pulse: null }), 1400);
      return;
    }
    this.setState({ sel: n.id });
  }

  render() {
    const done = effectiveDone(this.props.done || []); const active = this.props.active;
    const levels = new Set(this.props.levels || []);
    const st = id => nodeState(id, done, active);
    const VIS = NODES.filter(n => st(n.id) !== 'hidden');
    const byId = {}; NODES.forEach(n => { byId[n.id] = n; });
    const sel = this.state.sel && byId[this.state.sel];
    const H = rowY(13) + CH + 60;
    const edges = [];
    const pulse = this.state.pulse;
    VIS.forEach(n => n.deps.forEach(d => {
      const a = byId[d]; if (!a || st(d) === 'hidden') return;
      const missing = !done.has(d);   // from a prerequisite not done yet: dotted
      const pulsing = !!(pulse && pulse.to === n.id && missing);
      edges.push({ key: d + '>' + n.id + (pulsing ? ':' + pulse.k : ''), x1: COLS[a.col], y1: rowY(a.row) + CH, x2: COLS[n.col], y2: rowY(n.row),
        color: missing ? '#CBD5E1' : '#94A3B8', dash: missing ? '4 4' : 'none', pulsing: pulsing });
    }));
    // a finished node leading to one still hidden (not all its prerequisites on screen): the line starts out toward
    // it and fades away, without revealing the node
    const stubs = [];
    NODES.filter(n => st(n.id) === 'hidden').forEach(n => n.deps.filter(d => done.has(d) && byId[d]).forEach(d => {
      const a = byId[d]; const x1 = COLS[a.col], y1 = rowY(a.row) + CH, X = COLS[n.col], Y = rowY(n.row);
      const f = Math.min(1, 70 / Math.max(1, Math.hypot(X - x1, Y - y1)));
      stubs.push({ id: 'stub-' + d.replace('.', '_') + '-' + n.id.replace('.', '_'), x1: x1, y1: y1, x2: x1 + (X - x1) * f, y2: y1 + (Y - y1) * f });
    }));
    const look = n => {
      const def = n.kind === 'def';
      if (st(n.id) === 'next') return { bg: '#F1F5F9', fg: '#64748B', idFg: '#94A3B8', border: '1.5px solid #CBD5E1' };
      if (st(n.id) === 'partial') return { bg: '#F8FAFC', fg: '#94A3B8', idFg: '#CBD5E1', border: '1.5px dashed #CBD5E1' };
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
        <defs>${stubs.map(t => html`<linearGradient key=${t.id} id=${t.id} gradientUnits="userSpaceOnUse" x1=${t.x1} y1=${t.y1} x2=${t.x2} y2=${t.y2}><stop offset="0" stop-color="#94A3B8" stop-opacity="1"></stop><stop offset="1" stop-color="#94A3B8" stop-opacity="0"></stop></linearGradient>`)}</defs>
        ${stubs.map(t => html`<line key=${t.id} x1=${t.x1} y1=${t.y1} x2=${t.x2} y2=${t.y2} stroke=${'url(#' + t.id + ')'} stroke-width="1.5" stroke-linecap="round"></line>`)}
        ${edges.map(e => html`<line key=${e.key} x1=${e.x1} y1=${e.y1} x2=${e.x2} y2=${e.y2} stroke=${e.color} stroke-width="1.5" stroke-dasharray=${e.dash} style=${e.pulsing ? 'animation: edgePulse 0.6s ease-in-out 2' : ''}></line>`)}
      </svg>
      ${VIS.map(n => {
        const L = look(n); const active = n.id === this.props.active; const on = this.state.sel === n.id;
        // the level being played spins its glow; once won it holds a steady, brighter one (you're here, nothing to do)
        const won = active && (this.props.done || []).indexOf(n.id) >= 0;
        // a level you can start: its grey edge breathes lightly
        const playable = !active && st(n.id) === 'next' && levels.has(n.id);
        const missing = st(n.id) === 'partial' ? n.deps.filter(d => !done.has(d)) : null;
        const pulsed = !!(pulse && pulse.missing.indexOf(n.id) >= 0);
        const card = html`<button onClick=${() => this.tap(n, missing)} aria-label=${n.id + ' ' + n.title + (active ? ': the level being played' : st(n.id) === 'next' ? ': one step away' : missing ? ': needs ' + missing.join(', ') + ' first' : '')}
          style=${`position: absolute; left: ${active ? 2 : 0}px; top: ${active ? 2 : 0}px; width: ${active ? 108 : 112}px; height: ${active ? 36 : 40}px; box-sizing: border-box; padding: 0 8px; border-radius: ${active ? 8 : 10}px; border: ${active ? 'none' : L.border}; background: ${L.bg}; animation: ${playable ? 'edgeBreathe 2.2s ease-in-out infinite' : 'none'}; color: ${L.fg}; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; cursor: pointer; outline: ${on ? '3px solid #F59E0B' : 'none'}; outline-offset: 2px`}>
          <span style=${`font-size: 10px; font-weight: 700; color: ${L.idFg}; line-height: 12px`}>${n.id}</span>
          <span style="font-size: 12px; font-weight: 600; line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%">${n.name}</span>
        </button>`;
        return html`<div key=${n.id + (pulsed ? ':p' + pulse.k : '')} style=${`position: absolute; left: ${COLS[n.col] - 56}px; top: ${rowY(n.row)}px; width: 112px; height: 40px; border-radius: 10px; animation: ${[active && !won ? 'glowSpin 2.4s linear infinite' : '', pulsed ? 'nodePulse 0.6s ease-in-out 2' : ''].filter(Boolean).join(', ') || 'none'}; ${won ? 'background: linear-gradient(135deg, #F59E0B, #FDE68A 50%, #F59E0B); box-shadow: 0 0 22px 3px rgba(245,158,11,0.7)' : active ? 'background: conic-gradient(from var(--glowA), #EA580C 0 62%, #FDE68A 76%, #F59E0B 84%, #EA580C 96%); box-shadow: 0 0 14px rgba(245,158,11,0.45)' : ''}`}>${card}</div>`;
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
            ${st(sel.id) === 'next' ? html`<span style="font-size: 12px; color: #64748B">one step away</span>` : st(sel.id) === 'active' ? html`<span style="font-size: 12px; color: #C2410C">playing</span>` : null}
          </span>
          <span style="font-size: 19px; font-weight: 700; line-height: 24px">${sel.title}</span>
        </div>
        <button onClick=${() => this.setState({ sel: null })} aria-label="Close the explanation" style="flex: 0 0 auto; width: 40px; height: 40px; border-radius: 20px; border: 1px solid #E2E8F0; background: #FFFFFF; color: #334155; font-size: 22px; line-height: 1; cursor: pointer">×</button>
      </div>
      <div style="flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 16px 20px; display: flex; flex-direction: column; gap: 12px; font-size: 15px; line-height: 22px">
        ${(() => {
          const s2 = st(sel.id); const has = levels.has(sel.id);
          const btn = (label, fn, dis) => html`<button onClick=${dis ? null : fn} disabled=${!!dis} style=${`align-self: flex-start; height: 44px; padding: 0 20px; border-radius: 22px; border: none; background: ${dis ? '#E2E8F0' : '#1E3A8A'}; color: ${dis ? '#64748B' : '#FFFFFF'}; font: inherit; font-size: 15px; font-weight: 700; cursor: ${dis ? 'default' : 'pointer'}`}>${label}</button>`;
          if (s2 === 'active') return btn('Return to level', () => { this.setState({ sel: null }); if (this.props.onPlay) this.props.onPlay(); });
          if (sel.kind === 'def') return null; // definitions have no level
          if (s2 === 'next') return has ? btn('Start level', () => { this.setState({ sel: null }); if (this.props.onStart) this.props.onStart(sel.id); }) : btn('No level for this yet', null, true);
          return has ? btn('Replay level', () => { this.setState({ sel: null }); if (this.props.onStart) this.props.onStart(sel.id); }) : null;
        })()}
        <div style=${`display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: ${p.box}; border: 1px solid ${p.boxB}`}>${(st(sel.id) === 'done' ? sel.f : withoutProof(sel.f)).map(block)}</div>
        ${st(sel.id) !== 'done' && sel.f.some(b => b[0] === 'pr') ? html`<div style="font-size: 13px; color: #64748B">The book’s proof opens once you’ve completed this level.</div>` : null}
        ${sel.c.map(block)}
      </div>
    </div>` : null}
</div>`;
  }
}
