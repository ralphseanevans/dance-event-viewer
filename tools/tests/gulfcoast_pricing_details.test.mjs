// Gulf Coast cards: "Pricing details" toggle only when it saves space. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldCollapsePricing, PRICE_MAX_LINES, PRICE_MIN_SAVED_LINES } from '../../gulfcoast/simple-core.mjs';

const read = f => readFileSync(new URL('../../gulfcoast/' + f, import.meta.url), 'utf8');
const L = 20; // px line height
const toggle = 33; // px, the Pricing details row incl. margins

test('rule constants: more than 5 lines, saves at least 2 lines', () => {
  assert.equal(PRICE_MAX_LINES, 5); assert.equal(PRICE_MIN_SAVED_LINES, 2);
});

test('short pricing (1-5 lines) never collapses', () => {
  for (let n = 1; n <= 5; n++) assert.equal(shouldCollapsePricing({ fullHeight: n * L, collapsedHeight: Math.min(n, 1) * L, toggleHeight: toggle, lineHeight: L }), false, n + ' lines');
});

test('6 lines clamped to 5 plus a toggle row would make the card longer: no toggle', () => {
  assert.equal(shouldCollapsePricing({ fullHeight: 6 * L, collapsedHeight: 5 * L, toggleHeight: toggle, lineHeight: L }), false);
});

test('Halloween-style case: summary + toggle is barely shorter than the full text: no toggle', () => {
  assert.equal(shouldCollapsePricing({ fullHeight: 6 * L, collapsedHeight: 3 * L, toggleHeight: toggle, lineHeight: L }), false);
});

test('long pricing that collapses well keeps the toggle', () => {
  assert.equal(shouldCollapsePricing({ fullHeight: 9 * L, collapsedHeight: 5 * L, toggleHeight: toggle, lineHeight: L }), true);
  assert.equal(shouldCollapsePricing({ fullHeight: 7 * L, collapsedHeight: 2 * L, toggleHeight: toggle, lineHeight: L }), true);
});

test('unmeasured (hidden, zero-size) rows do not collapse', () => {
  assert.equal(shouldCollapsePricing({ fullHeight: 0, collapsedHeight: 0, toggleHeight: 0, lineHeight: L }), false);
  assert.equal(shouldCollapsePricing({ fullHeight: 200, collapsedHeight: 100, toggleHeight: 0, lineHeight: 0 }), false);
});

test('card wiring: full price inline, measured after render, re-checked on resize, no repeated summary', () => {
  const js = read('simple-flow.mjs'), css = read('simple.css');
  assert.match(js, /row\('ticket', ev\.cost \|\| ev\.cost_display/);
  assert.match(js, /new ResizeObserver\(entries =>/);
  assert.match(js, /shouldCollapsePricing\(\{ fullHeight, collapsedHeight, toggleHeight, lineHeight \}\)/);
  assert.doesNotMatch(js, /detail\('Pricing details', ev\.cost\)/, 'no separate copy of the price inside the toggle');
  assert.match(css, /\.is-price-clamped span\{[^}]*-webkit-line-clamp:5/);
});
