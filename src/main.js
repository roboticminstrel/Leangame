import { render } from '../vendor/preact.mjs';
import { html } from './html.js';
import { Range } from './range/Range.js';
import { createLean } from './lean/client.js';

// One Lean client: the Play pill (in the board's top bar) wakes the machine, and the board sends its moves to the live
// proof (Lean tab)
const lean = createLean();

render(html`<div style="position: relative; width: 100%; height: 100%"><${Range} lean=${lean} /></div>`, document.getElementById('app'));
