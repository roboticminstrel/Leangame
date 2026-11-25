// htm bound to Preact's h(): JSX-like templates with no build step.
import { h } from '../vendor/preact.mjs';
import htm from '../vendor/htm.mjs';

export const html = htm.bind(h);
