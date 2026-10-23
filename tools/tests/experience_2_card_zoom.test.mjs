// Exp2 compact card view: phone info panel scaled as a whole, column levels. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scheduleEntries } from '../../gulfcoast/simple-core.mjs';
import { clampZoom, fitZoom, ZOOM_NAMES, DEFAULT_ZOOM } from '../../gulfcoast/card-zoom.mjs';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const css = read('simple.css');
// Bounded at the fallback-flyer block that follows it (merged from #39).
const compact = css.slice(css.indexOf('/* Compact card view'), css.indexOf('/* Fallback flyer') > css.indexOf('/* Compact card view') ? css.indexOf('/* Fallback flyer') : undefined);
const C = '#simple-groups:not([data-zoom="0"])';

test('zoom level parsing falls back to the 6-across compact default', () => {
  assert.equal(DEFAULT_ZOOM, 1); assert.equal(ZOOM_NAMES.length, 6);
  for (const bad of [null, '', 'abc', undefined]) assert.equal(clampZoom(bad), 1);
  assert.equal(clampZoom('0'), 0); assert.equal(clampZoom('5'), 5); assert.equal(clampZoom('9'), 5); assert.equal(clampZoom('-2'), 0);
});

test('fitZoom fits exactly cols panels plus gaps into the row', () => {
  for (const [w, cols] of [[1020, 6], [876, 6], [1020, 12], [346, 2]]) {
    const z = fitZoom(w, cols, 14, 194);
    assert.ok(cols * 194 * z + (cols - 1) * 14 <= w, `${w}px/${cols}`);
    assert.ok(cols * 194 * (z + 0.002) + (cols - 1) * 14 > w, `${w}px/${cols} not too small`);
  }
});

test('compact view scales the whole card with zoom; no text-size floor', () => {
  assert.match(compact, /\.event-tile\.has-flyer\{zoom:var\(--z/);
  assert.doesNotMatch(compact, /card-floor|max\(12px/);
  assert.doesNotMatch(compact, /font[^;]*calc\((?!var\(--date-size\))/, 'card fonts are fixed native sizes; only zoom scales them');
});

test('compact card is the phone info panel: phone type sizes, no flyer, text wraps', () => {
  assert.match(compact, /:is\(\.tile-flyer-tab,\.tile-flyer-preview\)\{display:none\}/);
  assert.match(compact, /\.tile-style\{[^}]*font:600 12px/);
  assert.match(compact, /\.tile-name\{[^}]*font:700 24px\/1\.08 Georgia/);
  assert.match(compact, /\.tile-detail\{--date-size:16px;[^}]*font:400 var\(--date-size\)\/1\.3 Georgia/);
  assert.doesNotMatch(compact, /text-overflow:ellipsis|white-space:nowrap/);
});

test('compact puts the date and the time on separate lines; Full keeps them inline', () => {
  assert.ok(compact.includes(`${C} .tile-when-sep{display:none}`));
  assert.ok(compact.includes(`${C} :is(.tile-date,.tile-time){display:block}`));
  assert.doesNotMatch(css.slice(0, css.indexOf('/* Compact card view')), /tile-when-sep|tile-date|tile-time/);
  assert.match(read('simple-flow.mjs'), /when\.append\(dSpan, sep, tSpan\)/);
});

test('desktop default shows 6 across and zooming out adds columns', () => {
  const cols = [...compact.matchAll(/^#simple-groups\[data-zoom="(\d)"\]\{--cols:(\d+)\}$/gm)].map(m => Number(m[2]));
  assert.deepEqual(cols, [6, 7, 8, 10, 12]);
});

test('1280px and wider keeps the desktop columns; fewer only below 1280px', () => {
  const m = compact.match(/@media\(max-width:(\d+)px\)\{#simple-groups\[data-zoom="1"\]\{--cols:5\}/);
  assert.ok(m); assert.equal(Number(m[1]), 1279);
  assert.doesNotMatch(compact, /(max|min)-width:1280px/);
});

test('card text lines keep full-text titles', () => {
  const js = read('simple-flow.mjs');
  for (const v of ['style', 'c', 'name', 'span', 'when', 'm']) assert.match(js, new RegExp(`\\b${v}\\.title = `), v);
});

test('card-zoom module is cache-busted by content hash', () => {
  const sha8 = createHash('sha1').update(readFileSync(new URL('card-zoom.mjs', dir))).digest('hex').slice(0, 8);
  assert.match(read('simple-flow.mjs'), new RegExp(`card-zoom\\.mjs\\?v=${sha8}`));
});

test('schedule lines are exactly 0.75 of the date line size, stacked one per line', () => {
  const li = compact.match(/\.tile-schedule li\{([^}]*)\}/)[1];
  assert.match(li, /font-size:calc\(var\(--date-size\) \* 0\.75\)/);
  assert.match(li, /display:block/); assert.match(li, /tabular-nums/);
  assert.match(compact, /\.has-schedule :is\(\.tile-time,\.tile-when-sep\)\{display:none\}/);
  assert.match(css.slice(0, css.indexOf('/* Compact card view')), /\.tile-schedule\{display:none\}/, 'Full cards unchanged');
});

test('scheduleEntries formats entries and drops empty ones', () => {
  assert.deepEqual(scheduleEntries({ schedule: [{ label: 'Class', time: '18:00' }, { label: 'Class C', start_time: '19:00' }, { label: 'Dance', time: '22:30' }, '  ', {}] }),
    ['Class 6 PM', 'Class C 7 PM', 'Dance 10:30 PM']);
  assert.deepEqual(scheduleEntries({}), []); assert.deepEqual(scheduleEntries({ schedule: 'x' }), []);
});

test('no empty rows: placeholders and empty link rows are hidden on compact cards', () => {
  const js = read('simple-flow.mjs');
  for (const ph of ['Venue not listed', 'Cover not listed']) assert.ok(js.includes(ph));
  assert.match(js, /location\.parentElement\.classList\.add\('is-placeholder'\)/);
  assert.match(js, /price\.parentElement\.classList\.add\('is-placeholder'\)/);
  assert.match(js, /tSpan\.classList\.add\('is-placeholder'\)/);
  assert.match(js, /if \(!ev\.style\) style\.classList\.add\('is-placeholder'\)/);
  assert.ok(compact.includes('#simple-groups:not([data-zoom="0"]) .is-placeholder,#simple-groups:not([data-zoom="0"]) .tile-links:empty{display:none}'));
});

test('compact card links are pinned to the bottom edge (flex column + margin-top:auto)', () => {
  assert.ok(compact.includes('#simple-groups:not([data-zoom="0"]) .event-tile .tile-body{display:flex;flex-direction:column}'));
  assert.match(compact, /#simple-groups:not\(\[data-zoom="0"\]\) \.tile-links\{margin-top:auto;/);
  assert.match(compact, /\.day-events\{[^}]*align-items:stretch/, 'cards in a row are equal height');
});

test('compact cards hide the Full address expander but keep Pricing details', () => {
  const js = read('simple-flow.mjs');
  assert.match(js, /detail\('Full address', ev\.venue, 'address'\)/);
  assert.match(js, /fitPricing\(price, ev\.cost,/);
  assert.ok(compact.includes('#simple-groups:not([data-zoom="0"]) .tile-extra-address{display:none}'));
  assert.doesNotMatch(compact, /\.tile-extra\{display:none\}/);
  assert.doesNotMatch(css.slice(0, css.indexOf('/* Compact card view')), /tile-extra-address/, 'Full cards unchanged');
});
