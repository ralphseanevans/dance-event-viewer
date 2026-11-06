// Bachata in the /gulfcoast/ styles picker. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../../gulfcoast/simple-core.mjs';

const today = new Date(2026, 9, 27);
const ev = (key, name, style) => ({ key, name, style, type: 'weekly_recurring', day_of_week: 'Sunday', venue: 'Studio, Pensacola, FL', state: 'FL' });

test('Bachata option comes from the tag or the title, and filters to those events only', () => {
  const items = [
    ev('ss', 'Sensual Sundays -- Bachata Class & Social', 'Latin'),
    ev('wcs', 'WCS Night', 'West Coast Swing'),
    ev('sb', 'Salsa Social', 'Salsa / Bachata')
  ].map(e => ({ ev: e, date: core.nextOccurrence(e, today) }));
  assert.deepEqual(core.eventStyles(items[0].ev), ['Latin', 'Bachata']);
  assert.deepEqual(core.eventStyles(items[2].ev), ['Salsa', 'Bachata']);
  assert.ok(core.availableStyles(items).partner.includes('Bachata'));
  const keys = core.groupByDate(items, ['Bachata']).flatMap(g => g.items).map(x => x.ev.key).sort();
  assert.deepEqual(keys, ['sb', 'ss']);
});

test("combined 'Salsa/Bachata' tags count as both Salsa and Bachata, for options and filtering", () => {
  for (const tag of ['Salsa/Bachata', 'Salsa / Bachata', 'Bachata/Salsa', 'Salsa/Bachata (Latin)']) assert.deepEqual(core.eventStyles(ev('x', 'Social', tag)).sort(), ['Bachata', 'Salsa'], tag);
  const items = [ev('combo', 'Latin Social', 'Salsa/Bachata'), ev('salsa', 'Salsa Night', 'Salsa')].map(e => ({ ev: e, date: core.nextOccurrence(e, today) }));
  const opts = core.availableStyles(items).partner;
  assert.ok(opts.includes('Salsa') && opts.includes('Bachata'));
  assert.deepEqual(core.groupByDate(items, ['Bachata']).flatMap(g => g.items).map(x => x.ev.key), ['combo']);
  assert.deepEqual(core.groupByDate(items, ['Salsa']).flatMap(g => g.items).map(x => x.ev.key).sort(), ['combo', 'salsa']);
});

test('no bachata listings means no Bachata option (never an empty filter)', () => {
  const items = [ev('wcs', 'WCS Night', 'West Coast Swing'), ev('l', 'Latin Night (Salsa, Merengue)', 'Latin')].map(e => ({ ev: e, date: core.nextOccurrence(e, today) }));
  assert.ok(!core.availableStyles(items).partner.includes('Bachata'));
});

test('Bachata keeps using the existing illustrated badge', () => {
  assert.match(readFileSync(new URL('../../gulfcoast/simple-flow.mjs', import.meta.url), 'utf8'), /'Bachata': 'bachata\.png'/);
});
