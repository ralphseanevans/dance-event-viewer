// Active (highlighted) calendar day number is 25% larger, no layout shift. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../gulfcoast/simple.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../../gulfcoast/sticky-calendar.mjs', import.meta.url), 'utf8');

test('sticky calendar marks the highlighted day with .is-active', () => {
  assert.match(js, /key === active \? ' is-active' : ''/);
});

test('active day font is 25% larger than base on desktop and phones', () => {
  assert.match(css, /\.calendar-day,\.calendar-blank\{height:30px;[^}]*font-size:13px/);
  assert.match(css, /button\.calendar-day\.is-active\{font-size:16\.25px\}/); // 13 * 1.25
  assert.match(css, /\.calendar-day,\.calendar-blank\{height:26px;font-size:12px\}/);
  assert.match(css, /@media\(max-width:820px\)\{button\.calendar-day\.is-active\{font-size:15px\}\}/); // 12 * 1.25
});

test('enlarge animates smoothly and respects reduced motion; 40px phone buttons kept', () => {
  assert.match(css, /button\.calendar-day\{[^}]*transition:[^}]*font-size \.15s ease/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{button\.calendar-day\{transition:none\}\}/);
  assert.match(css, /\.calendar-day,\.calendar-blank\{height:40px\}/);
  assert.doesNotMatch(css, /is-active[^{]*\{[^}]*(height|width|padding|margin)/);
});
