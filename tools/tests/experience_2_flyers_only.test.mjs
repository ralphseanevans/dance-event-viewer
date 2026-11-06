// Exp2 "Flyers only" chip: hides events without a real flyer image. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FLYERS_ONLY_KEY, parseFlyersOnly } from '../../gulfcoast/flyers-only.mjs';
import { flyersFor, groupByDate, hasRealFlyer } from '../../gulfcoast/simple-core.mjs';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);
const js = read('simple-flow.mjs'), css = read('simple.css');

test('Flyers only is a real toggle button with aria-pressed, remembered in localStorage', () => {
  const m = read('flyers-only.mjs');
  assert.equal(FLYERS_ONLY_KEY, 'ev2-flyers-only');
  assert.equal(parseFlyersOnly('1'), true);
  for (const v of [null, '', '0', 'true']) assert.equal(parseFlyersOnly(v), false, String(v));
  assert.match(m, /button\.type = 'button'; button\.className = 'flyers-only'; button\.textContent = 'Flyers only'/);
  assert.match(m, /button\.setAttribute\('aria-pressed', String\(on\)\)/);
  assert.match(m, /localStorage\.setItem\(FLYERS_ONLY_KEY, on \? '1' : '0'\)/);
  assert.match(m, /listTools\.append\(button, zoomBox\)/, 'sits next to the card-size slider');
  assert.match(js, /state\.flyersOnly = initFlyersOnly\(el\.groups\.previousElementSibling,/);
  assert.match(js, new RegExp(`flyers-only\\.mjs\\?v=${sha8('flyers-only.mjs')}`));
});

test('filter keeps only events with a real flyer, before date grouping', () => {
  assert.match(js, /const listed = state\.flyersOnly \? items\.filter\(x => hasRealFlyer\(x\.ev, state\.logoMap\)\) : items;/);
  assert.match(js, /const allGroups = groupByDate\(listed, visibleStyles\);/);
  assert.match(js, /state\.allDays = allGroups\.map\(g => g\.day\)/, 'calendar days follow the filtered groups');
});

test('empty date groups disappear when their events have no flyer', () => {
  const day = (d, flyer) => ({ ev: { key: d, name: d, style: 'Salsa', ...(flyer ? { flyer_url: 'x.png' } : {}) }, date: new Date(d + 'T12:00:00'), canceled: false });
  const items = [day('2026-10-20', true), day('2026-10-21', false)];
  const listed = items.filter(x => flyersFor(x.ev, { logos: {}, patterns: [] }).length);
  const groups = groupByDate(listed, ['Salsa']);
  assert.deepEqual(groups.map(g => g.day), ['2026-10-20']);
  assert.equal(flyersFor({ key: 'k' }, { logos: { k: 'l.png' }, patterns: [] }).length, 1, 'logo-map flyers count as real');
});

test('zero matches show a short friendly message', () => {
  assert.match(js, /state\.flyersOnly \? 'No events with flyers here yet\. Turn off Flyers only to see them all\.'/);
});

test('chip is flat and quiet (page tokens, no shadows/gradients)', () => {
  const b = css.slice(css.indexOf('/* Flyers only chip'), css.indexOf('/* Fallback flyer'));
  assert.ok(b.length > 100);
  assert.doesNotMatch(b, /box-shadow|gradient/);
  assert.match(b, /\.flyers-only\[aria-pressed="true"\]\{border-color:var\(--red\)/);
});

test('Exp2 cache busters match content for Flyers only', () => {
  const html = read('index.html');
  assert.match(html, new RegExp(`simple\\.css\\?v=${sha8('simple.css')}`));
  assert.match(html, new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});

test('flip corner and Flyers only share one real-flyer rule', () => {
  const map = { logos: { a: 'a.png', e: [] }, patterns: [{ contains: 'pat', logo: 'p.png' }] };
  const evs = [{ key: 'a' }, { key: 'b', flyer_url: 'b.png' }, { key: 'x-pat-y' }, { key: 'none' }, { key: 'e' }, { key: 'f', flyer_url: '' }];
  assert.deepEqual(evs.map(e => hasRealFlyer(e, map)), [true, true, true, false, false, false]);
  evs.forEach(e => assert.equal(hasRealFlyer(e, map), flyersFor(e, map).length > 0));
  assert.match(js, /const flyers = hasRealFlyer\(ev, state\.logoMap\) \? flyersFor\(ev, state\.logoMap\)\.map\(resolve\) : \[\];/, 'corner uses the shared rule');
  assert.equal((js.match(/flyersFor\(x\.ev/g) || []).length, 0, 'no second copy of the rule in the filter');
});

test('Flyers only shows a flyer-only gallery, not cards', () => {
  const r = js.slice(js.indexOf('function render('), js.indexOf("el.more.addEventListener('click'"));
  assert.match(r, /if \(state\.flyersOnly\) \{[\s\S]*?g\.items\.map\(flyerThumb\)[\s\S]*?\} else \{\s*blocks = shown\.map\(dateBlock\);/);
  assert.match(r, /el\.groups\.classList\.toggle\('is-flyer-gallery', state\.flyersOnly\)/, 'off restores cards');
  const f = js.slice(js.indexOf('function flyerThumb('), js.indexOf('function dateBlock('));
  assert.match(f, /img\.alt = 'Flyer for ' \+ ev\.name; img\.loading = 'lazy'/, 'alt text + lazy loading');
  assert.match(f, /openLightbox\(flyers, ev\.name, b, true\)/, 'tap opens the full-screen close-up');
  assert.match(f, /thumbs|b\.dataset\.date = day/);
  assert.doesNotMatch(f, /tile-flip-corner|date-heading|tile-links|badge/, 'no card chrome');
  assert.match(r, /thumbs\[0\]\.id = `simple-date-\$\{g\.day\}`/, 'calendar day jumps still land in the gallery');
});

test('gallery is 2 columns at phone width', () => {
  const b = css.slice(css.indexOf('/* Flyers only gallery'));
  assert.match(b, /@media\(max-width:560px\)\{\.flyer-gallery\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(b, /box-shadow|gradient/);
});

test('date ranges still filter the gallery (same groups as cards)', () => {
  const mk = (d, f) => ({ ev: { key: d, name: d, style: 'Salsa', ...(f ? { flyer_url: 'x.png' } : {}) }, date: new Date(d + 'T12:00:00'), canceled: false });
  const items = [mk('2026-10-22', true), mk('2026-10-23', false), mk('2026-10-30', true)];
  const groups = groupByDate(items.filter(x => hasRealFlyer(x.ev, {})), ['Salsa']);
  const ranges = [{ start: '2026-10-20', end: '2026-10-25' }];
  assert.deepEqual(groups.filter(g => ranges.some(r => g.day >= r.start && g.day <= r.end)).map(g => g.day), ['2026-10-22']);
});
