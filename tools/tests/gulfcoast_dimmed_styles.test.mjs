import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../../gulfcoast/simple-core.mjs';

const today = new Date(2026, 9, 27);
const ev = (key, name, style, date = '2026-11-01') => ({ key, name, style, verified: true, date, venue: 'Pensacola, FL' });
const item = e => ({ ev: e, date: new Date(e.date + 'T00:00:00') });
const BADGES = ['Salsa', 'West Coast Swing', 'Bachata', 'Hustle'];

test('badged styles with no upcoming events show as dimmed choices; ones with events stay active', () => {
  const items = [item(ev('w', 'WCS Night', 'West Coast Swing')), item(ev('s', 'Salsa Social', 'Salsa'))];
  const { partner } = core.styleChoices(items, items, BADGES);
  assert.deepEqual(partner, [
    { style: 'West Coast Swing', active: true },
    { style: 'Bachata', active: false },
    { style: 'Hustle', active: false },
    { style: 'Salsa', active: true }
  ]);
});

test('a style with events elsewhere in the markets but not in the chosen places is dimmed', () => {
  const all = [item(ev('w', 'WCS Night', 'West Coast Swing')), item(ev('b', 'Bachata Night', 'Bachata'))];
  const here = all.slice(0, 1);
  const by = Object.fromEntries(core.styleChoices(all, here, BADGES).partner.map(c => [c.style, c.active]));
  assert.equal(by['Bachata'], false);
  assert.equal(by['West Coast Swing'], true);
});

test('Bachata turns active as soon as a bachata listing is upcoming, in the same position', () => {
  const none = core.styleChoices([], [], BADGES).partner.map(c => c.style);
  const items = [item(ev('b', 'Sensual Sundays -- Bachata Class & Social', 'Latin'))];
  const some = core.styleChoices(items, items, BADGES).partner;
  assert.equal(some.find(c => c.style === 'Bachata').active, true);
  assert.deepEqual(some.map(c => c.style).filter(s => none.includes(s)), none, 'badged styles keep a stable order');
});

test('styles without a badge only appear when they have events (unchanged)', () => {
  const items = [item(ev('z', 'Zouk Night', 'Brazilian Zouk'))];
  assert.ok(core.styleChoices(items, items, BADGES).partner.some(c => c.style === 'Brazilian Zouk'));
  assert.ok(!core.styleChoices([], [], BADGES).partner.some(c => c.style === 'Brazilian Zouk'));
});

test('clicking a dimmed style does nothing; active styles still toggle', () => {
  const start = new Set(['Salsa']);
  assert.deepEqual([...core.toggleStyle(start, 'Bachata', false)], ['Salsa']);
  assert.deepEqual([...core.toggleStyle(start, 'Bachata', true)].sort(), ['Bachata', 'Salsa']);
  assert.deepEqual([...core.toggleStyle(start, 'Salsa', true)], []);
  assert.deepEqual([...start], ['Salsa'], 'input set is not mutated');
});

test('the picker wires dimmed badges as aria-disabled with a reason and ignores their clicks', () => {
  const src = readFileSync(new URL('../../gulfcoast/simple-flow.mjs', import.meta.url), 'utf8');
  assert.match(src, /styleChoices\(styleCatalog, nearbyItems, Object\.keys\(STYLE_BADGES\)\)/);
  assert.match(src, /getAttribute\('aria-disabled'\) === 'true'\) return;/);
  assert.match(src, /setAttribute\('aria-disabled', 'true'\)/);
  assert.match(src, /No upcoming \$\{style\} events right now/);
  assert.match(src, /aria-describedby/);
  assert.doesNotMatch(src, /b\.disabled = true/);
});
