import { render } from '../vendor/preact.mjs';
import { html } from './html.js';
import { Range } from './range/Range.js';
import { LeanPlay } from './lean/LeanPlay.js';

render(html`<div style="position: relative; width: 100%; height: 100%"><${Range} /><${LeanPlay} /></div>`,
  document.getElementById('app'));
