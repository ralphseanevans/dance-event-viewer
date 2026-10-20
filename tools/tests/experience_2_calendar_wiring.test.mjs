// Exp2 page wiring: the calendar marks only listed dates (after ranges, styles, Flyers only).
// QA: range Oct 21-21 still marked 10 days; empty range+Hustle kept Oct 26. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../gulfcoast/simple-flow.mjs', import.meta.url), 'utf8');

test('calendar.set receives range-filtered days, and no days when results are empty', () => {
  const calls = [...js.matchAll(/calendar\.set\(([^,]+),/g)].map(m => m[1].trim());
  assert.deepEqual(calls, ['[]', 'groups.map(g => g.day)']);
  assert.match(js, /const groups = state\.dateRanges\.length\s*\?\s*allGroups\.filter/);
});
