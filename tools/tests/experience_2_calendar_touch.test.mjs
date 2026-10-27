// Gulf Coast sticky calendar: a finger swipe across dates selects a range (each new drag adds
// another range); swipes outside the calendar grid still scroll the page. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);

test('touch/pen drag-select on calendar dates is not limited to mouse or range mode', () => {
  const js = read('sticky-calendar.mjs');
  const down = js.match(/grid\.addEventListener\('pointerdown',[\s\S]*?\n  \}\);/)[0];
  assert.doesNotMatch(down, /pointerType/);
  assert.doesNotMatch(down, /rangeMode/);
  assert.match(down, /dragStart = dragEnd = b\.dataset\.date; dragPointer = e\.pointerId/);
  // Each finished drag appends a new range (multi-range), it does not replace the list.
  assert.match(js, /selectedRanges = \[\.\.\.selectedRanges, range\]/);
});

test('a page scroll during a drag does not cancel it (second drag used to be dropped while the page glided)', () => {
  const js = read('sticky-calendar.mjs');
  for (const m of js.matchAll(/addEventListener\('scroll',([^\n]*)/g)) assert.doesNotMatch(m[1], /drag/, 'a scroll listener must not touch drag state');
  // The range end still follows whatever date is under the pointer, so a scrolled page stays accurate.
  assert.match(js, /document\.elementFromPoint\(e\.clientX, e\.clientY\)/);
});

test('touch-action:none only on the calendar grid, never on the page or sticky bar', () => {
  const css = read('simple.css');
  const rules = [...css.matchAll(/([^{}]*)\{([^}]*touch-action:\s*none[^}]*)\}/g)].map(m => m[1].trim().split('\n').pop().trim());
  const cal = rules.filter(sel => /calendar/.test(sel));
  assert.ok(cal.some(sel => sel.split(',').map(s => s.trim()).includes('.calendar-days')), 'grid must have touch-action:none');
  for (const sel of cal) for (const part of sel.split(',')) assert.match(part.trim(), /^(\.calendar-days\b|button\.calendar-day$)/, `touch-action:none must be scoped to the grid: ${part}`);
  assert.doesNotMatch(css, /button\.calendar-day\{touch-action:manipulation\}/);
});

test('cache busters match content for the calendar fix', () => {
  assert.match(read('simple-flow.mjs'), new RegExp(`sticky-calendar\\.mjs\\?v=${sha8('sticky-calendar.mjs')}`));
  const html = read('index.html');
  assert.match(html, new RegExp(`simple\\.css\\?v=${sha8('simple.css')}`));
  assert.match(html, new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});
