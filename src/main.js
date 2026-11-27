import { render } from '../vendor/preact.mjs';
import { html } from './html.js';
import { Home } from './Home.js';
import { createLean } from './lean/client.js';

// One Lean client: the Play pill (in the board's top bar) wakes the machine, and the board sends its moves to the live
// proof (Lean tab)
const lean = createLean();

// every visit starts at the choice of games (Home): the Natural Number Game or Linear Algebra (the Range)
render(html`<div style="position: relative; width: 100%; height: 100%"><${Home} lean=${lean} /></div>`, document.getElementById('app'));
