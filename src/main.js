import { render } from '../vendor/preact.mjs';
import { html } from './html.js';
import { Range } from './range/Range.js';

render(html`<${Range} />`, document.getElementById('app'));
