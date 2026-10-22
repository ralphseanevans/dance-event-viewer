// Gulf Coast page Simple mode: styles, scheduling, grouping. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../../gulfcoast/simple-core.mjs';

const today = new Date(2026, 9, 14); // Wed Oct 14 2026
const ev = (o) => ({ key: o.name, venue: 'Hall, Pensacola, FL', state: 'FL', ...o });

test('styles: West Coast Swing first, then A–Z; solo styles kept separate; Ballroom stays visible', () => {
  const { partner, solo } = core.orderStyles(['Salsa', 'Ballroom', 'West Coast Swing', 'Jazz', 'Ballroom', 'Country Swing', 'Line Dance']);
  assert.deepEqual(partner, ['West Coast Swing', 'Ballroom', 'Country Swing', 'Salsa']);
  assert.deepEqual(solo, ['Jazz', 'Line Dance']);
  assert.deepEqual(core.styleFacets('Ballroom (Social)'), ['Ballroom']);
});

test('next occurrence: weekly, monthly ordinal, numeric monthly, ongoing multi-day, ended', () => {
  const d = x => x && core.iso(x);
  assert.equal(d(core.nextOccurrence({ type: 'weekly_recurring', day_of_week: 'Friday' }, today)), '2026-10-16');
  assert.equal(d(core.nextOccurrence({ type: 'weekly_recurring', day_of_week: 'Friday', exclude_dates: ['2026-10-16'] }, today)), '2026-10-23');
  assert.equal(d(core.nextOccurrence({ type: 'monthly_recurring', monthly_rule: '3rd Saturday' }, today)), '2026-10-17');
  assert.equal(d(core.nextOccurrence({ type: 'monthly_recurring', monthly_rule: '2nd Friday' }, today)), '2026-11-13');
  assert.equal(d(core.nextOccurrence({ type: 'monthly_recurring', monthly_rule: '15th' }, today)), '2026-10-15');
  assert.equal(d(core.nextOccurrence({ type: 'one_time', start_date: '2026-10-12', end_date: '2026-10-18' }, today)), '2026-10-14');
  assert.equal(core.nextOccurrence({ type: 'one_time', start_date: '2026-10-01' }, today), null);
  assert.equal(core.nextOccurrence({ type: 'weekly_recurring', day_of_week: 'Monday', end_date: '2026-10-15' }, today), null);
});

test('upcomingIn filters by market, drops unverified; groups put canceled last within a day', () => {
  const events = [
    ev({ name: 'B', style: 'West Coast Swing', type: 'one_time', start_date: '2026-10-16', start_time: '19:00' }),
    ev({ name: 'A', style: 'West Coast Swing', type: 'one_time', start_date: '2026-10-16', start_time: '18:00', canceled_dates: ['2026-10-16'] }),
    ev({ name: 'C', style: 'Salsa', type: 'one_time', start_date: '2026-10-15' }),
    ev({ name: 'U', style: 'West Coast Swing', type: 'one_time', start_date: '2026-10-15', unverified: true }),
    ev({ name: 'M', style: 'West Coast Swing', type: 'one_time', start_date: '2026-10-15', venue: 'Club, Mobile, AL', state: 'AL' })
  ];
  const items = core.upcomingIn(events, ['pensacola'], today);
  assert.deepEqual(items.map(x => x.ev.name).sort(), ['A', 'B', 'C']);
  assert.deepEqual(core.availableStyles(items).partner, ['West Coast Swing', 'Salsa']);
  const groups = core.groupByDate(items, ['West Coast Swing']);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map(x => x.ev.name), ['B', 'A']);
  assert.equal(groups[0].items[1].canceled, true);
});

test('flyers: flyer_url first, then logo-map pages, deduped', () => {
  const map = { logos: { k: ['a.png', 'b.png'] }, patterns: [{ contains: 'x', logo: 'p.png' }] };
  assert.deepEqual(core.flyersFor({ key: 'k', flyer_url: 'a.png' }, map), ['a.png', 'b.png']);
  assert.deepEqual(core.flyersFor({ key: 'zxz' }, map), ['p.png']);
});
test('page: Simple is the initial mode and is not persisted', () => {
  const html = readFileSync(new URL('../../gulfcoast/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-mode="simple"[^>]*aria-pressed="true"/);
  const js = readFileSync(new URL('../../gulfcoast/simple-flow.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /localStorage|sessionStorage|URLSearchParams/);
  const order = ['id="simple-where"', 'id="simple-styles"', 'id="simple-results"'].map(s => html.indexOf(s));
  assert.ok(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])), 'Where -> Styles -> When/cards order');
});

test('styleFacets normalizes raw city values to clean names', async () => {
  const core = await import('../../gulfcoast/simple-core.mjs');
  assert.deepEqual(core.styleFacets('Ballroom (Cha Cha / East Coast Swing)'), ['Ballroom']);
  assert.deepEqual(core.styleFacets('Ballroom (cued)'), ['Ballroom']);
  assert.deepEqual(core.styleFacets('Country Western (UCWDC)'), ['Country']);
  assert.deepEqual(core.styleFacets('Salsa / Bachata'), ['Salsa', 'Bachata']);
  assert.deepEqual(core.styleFacets('Ballroom / West Coast Swing'), ['Ballroom', 'West Coast Swing']);
  assert.deepEqual(core.styleFacets('Country Swing'), ['Country Swing']);
});

test('EV2 card title links to the /e/ page and the bottom Event link is gone', () => {
  const js = readFileSync(new URL('../../gulfcoast/simple-flow.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /'Event ↗'/);
  assert.match(js, /state\.eventPages\.has\(ev\.key\)/);
  assert.match(js, /t\.className = 'tile-name-link'; t\.href = new URL\('e\/' \+ ev\.key \+ '\.html', SITE\)\.href/);
  assert.match(js, /else name\.textContent = ev\.card_title \|\| ev\.name/);
  const css = readFileSync(new URL('../../gulfcoast/simple.css', import.meta.url), 'utf8');
  assert.match(css, /\.tile-name-link\{color:inherit;/);
  assert.match(css, /\.tile-name-link:focus-visible\{outline:2px solid/);
});
