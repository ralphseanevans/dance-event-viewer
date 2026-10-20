// Exp2 "Flyers only" chip: hides events without a real flyer image. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FLYERS_ONLY_KEY, parseFlyersOnly } from '../../dance-event-viewer/experiments/experience-2/flyers-only.mjs';
import { flyersFor, groupByDate } from '../../dance-event-viewer/experiments/experience-2/simple-core.mjs';

const dir = new URL('../../dance-event-viewer/experiments/experience-2/', import.meta.url);
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
  assert.match(js, /const listed = state\.flyersOnly \? items\.filter\(x => flyersFor\(x\.ev, state\.logoMap\)\.length\) : items;/);
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
