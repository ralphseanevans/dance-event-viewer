// Exp2 phone calendar (≤600px) stays compact with ≥40px tap targets. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../dance-event-viewer/experiments/experience-2/simple.css', import.meta.url), 'utf8');

test('phone calendar block keeps 40px targets and a short scrolling grid', () => {
  const block = css.slice(css.lastIndexOf('@media(max-width:600px){\n.calendar-sticky'));
  assert.ok(block.length > 30, 'phone calendar media block exists');
  assert.match(block, /\.calendar-day,\.calendar-blank\{height:40px/);
  assert.match(block, /\.calendar-head button\{width:40px;height:40px/);
  assert.match(block, /\.calendar-range summary\{[^}]*width:40px;height:40px/);
  assert.match(block, /\.calendar-days\{max-height:83px;overflow-y:auto/);
});
