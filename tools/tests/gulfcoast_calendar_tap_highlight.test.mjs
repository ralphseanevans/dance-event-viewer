// Gulf Coast calendar: tapping a day on a phone must enlarge THAT day, not the one above it.
// The scroll-spy band used to be a fixed 35%-45% of the viewport; on phones the tapped day's
// heading lands below 45% (pinned calendar + scroll padding), so the band caught the previous day.
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spyRootMargin, createStickyCalendar } from '../../gulfcoast/sticky-calendar.mjs';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);
const band = (vh, land) => { const [t, , b] = spyRootMargin(vh, land).split(' ').map(x => -parseFloat(x)); return [t, vh - b]; };

test('desktop keeps the original 35%-45% band', () => {
  assert.equal(spyRootMargin(900, 114), '-315px 0px -495px 0px');
});

test('phone: band starts below where the tapped day lands, so the day above is not caught', () => {
  for (const [vh, land] of [[844, 381], [667, 381], [568, 360], [932, 400]]) {
    const [top, bottom] = band(vh, land);
    assert.ok(top > land, `${vh}: band top ${top} must be below landing line ${land}`);
    assert.ok(bottom > top && bottom <= vh, `${vh}: band [${top}, ${bottom}] must be non-empty and on screen`);
  }
});

test('spy band follows html scroll-padding-top + date-block scroll-margin-top, and is rebuilt when --cal-h changes', () => {
  const js = read('sticky-calendar.mjs');
  assert.match(js, /scrollPaddingTop[\s\S]{0,120}scrollMarginTop/);
  assert.match(js, /rootMargin: spyMargin/);
  assert.doesNotMatch(js, /rootMargin: '-35% 0px -55% 0px'/);
  assert.match(js, /setProperty\('--cal-h', h\);\s*\n\s*if \(spyBlocks\.length\) spy\(\);/);
});

test('phone layout: the live observer band starts below the landing line (fake DOM)', () => {
  const opts = [];
  const el = () => ({ children: [], dataset: {}, style: { setProperty() {} }, classList: { toggle() {} }, setAttribute() {}, appendChild() {}, replaceChildren(...c) { this.children = c; }, addEventListener() {}, getBoundingClientRect: () => ({ height: 281 }), querySelectorAll: () => [], querySelector: () => null });
  Object.assign(globalThis, {
    document: { createElement: el, addEventListener() {}, documentElement: { tag: 'html' } },
    window: { addEventListener() {}, innerHeight: 844 }, requestAnimationFrame: () => 1,
    // html keeps the copied main-viewer scroll-padding-top:90px; phone date blocks use --cal-h + 10px.
    getComputedStyle: x => x?.tag === 'html' ? { scrollPaddingTop: '90px' } : { position: 'relative', scrollMarginTop: '291px' },
    IntersectionObserver: class { constructor(cb, o) { opts.push(o); } observe() {} disconnect() {} }
  });
  const parts = { '.calendar-month-label': el(), '.calendar-prev': el(), '.calendar-next': el(), '.calendar-days': el(), '.calendar-sticky': el() };
  const root = el(); root.querySelector = s => parts[s] || null;
  const cal = createStickyCalendar({ root, scrollHost: el() });
  cal.set(['2026-10-27', '2026-10-28'], [el(), el()]);
  const top = -parseFloat(opts.at(-1).rootMargin);
  assert.ok(top > 90 + 291, `band top ${top}px must sit below where a tapped day lands (381px)`);
});

test('cache busters match content for the tap-highlight fix', () => {
  assert.match(read('simple-flow.mjs'), new RegExp(`sticky-calendar\\.mjs\\?v=${sha8('sticky-calendar.mjs')}`));
  assert.match(read('index.html'), new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});
