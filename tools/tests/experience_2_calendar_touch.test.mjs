// Exp2 sticky calendar: phone swipes must scroll, not paint red range marks (Oct 16 bug). Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../dance-event-viewer/experiments/experience-2/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);

test('touch drag-select on calendar dates is gated on range mode and cancelled by scrolling', () => {
  const js = read('sticky-calendar.mjs');
  assert.match(js, /pointerdown[\s\S]{0,200}e\.pointerType !== 'mouse' && !rangeMode\(\)\) return;/);
  assert.match(js, /addEventListener\('scroll',[^\n]*dragStart = dragEnd = dragPointer = null/);
});

test('calendar dates allow page panning by default; touch-action:none only with the range panel open', () => {
  const css = read('simple.css');
  const rules = [...css.matchAll(/([^{}]*button\.calendar-day[^{}]*)\{([^}]*touch-action:[^}]*)\}/g)].map(m => [m[1].trim(), m[2]]);
  const last = rules.filter(([sel]) => /^button\.calendar-day$/.test(sel.split('\n').pop().trim())).pop();
  assert.ok(last && /touch-action:manipulation/.test(last[1]), 'default calendar-day rule must end with touch-action:manipulation');
  assert.ok(rules.some(([sel, body]) => sel.includes('#calendar-range-details[open]') && /touch-action:none/.test(body)));
});

test('Exp2 cache busters match content for the calendar fix', () => {
  assert.match(read('simple-flow.mjs'), new RegExp(`sticky-calendar\\.mjs\\?v=${sha8('sticky-calendar.mjs')}`));
  const html = read('index.html');
  assert.match(html, new RegExp(`simple\\.css\\?v=${sha8('simple.css')}`));
  assert.match(html, new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});
