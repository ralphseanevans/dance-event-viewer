// Shared cancel rules (dance-event-viewer/js/cancel-core.js) and the schedule fixes that went
// with them (2026-10-31). Run from the repo root:  node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../../dance-event-viewer/js/cancel-core.js';
import { nextOccurrence, isPast, cancellationFor as scheduleCancel } from '../event_schedule.mjs';
import { isCanceledOn, nextOccurrence as simpleNext } from '../../gulfcoast/simple-core.mjs';
import { occursOn, searchEvents } from '../../gulfcoast/events.mjs';
import { FIELDS as FEED_FIELDS } from '../supabase/functions/dance-events/feed.mjs';

const { DEVCancel } = globalThis;
const C = DEVCancel.cancellationFor;
const DAY = '2026-11-05';

test('labels are unchanged', () => {
  assert.deepEqual({ ...DEVCancel.LABELS }, { confirmed: 'CONFIRMED CANCELED', likely: 'LIKELY CANCELED', owner: 'Officially canceled.' });
});

test('plain "YYYY-MM-DD" string -> likely, no note', () => {
  assert.deepEqual(C({ canceled_dates: [DAY] }, DAY), { status: 'likely', label: 'LIKELY CANCELED', whole: false, note: null, reason: null });
  assert.equal(C({ canceled_dates: [DAY] }, '2026-11-12'), null);
});

test('current object {date, cancel_status, reason}', () => {
  const c = C({ canceled_dates: [{ date: DAY, cancel_status: 'confirmed', reason: ' Bree is on break ' }] }, DAY);
  assert.equal(c.status, 'confirmed'); assert.equal(c.label, 'CONFIRMED CANCELED');
  assert.equal(c.note, 'Bree is on break'); assert.equal(c.reason, 'Bree is on break'); assert.equal(c.whole, false);
});

test('future object {date, status, note, source, labeled_by, labeled_at, owner_auth}', () => {
  const entry = { date: DAY, status: 'confirmed', note: 'Off this week', source: 'facebook:post', labeled_by: 'bot', labeled_at: '2026-10-31T09:00:00-05:00' };
  const c = C({ canceled_dates: [entry] }, DAY);
  assert.equal(c.status, 'confirmed'); assert.equal(c.note, 'Off this week');
  // New spelling wins when both are present.
  assert.equal(C({ canceled_dates: [{ date: DAY, status: 'confirmed', cancel_status: 'owner', note: 'new', reason: 'old' }] }, DAY).status, 'confirmed');
  assert.equal(C({ canceled_dates: [{ date: DAY, status: 'confirmed', note: 'new', reason: 'old' }] }, DAY).note, 'new');
  // Mixed arrays work.
  const ev = { canceled_dates: ['2026-11-12', entry, { date: '2026-11-19', cancel_status: 'likely', reason: 'r' }] };
  assert.deepEqual(['2026-11-05', '2026-11-12', '2026-11-19'].map(d => C(ev, d).status), ['confirmed', 'likely', 'likely']);
});

test('unknown or missing status -> likely; owner only when the data says owner', () => {
  for (const s of [undefined, null, '', 'maybe', 'Owner?', 'officially canceled', 'host', 7, {}])
    assert.equal(C({ canceled_dates: [{ date: DAY, status: s }] }, DAY).status, 'likely', String(s));
  assert.equal(C({ canceled_dates: [{ date: DAY, cancel_status: ' OWNER ' }] }, DAY).label, 'Officially canceled.');
  assert.equal(C({ canceled_dates: [{ date: DAY, status: 'owner' }] }, DAY).status, 'owner');
  // owner_auth alone never makes an entry "owner".
  assert.equal(C({ canceled_dates: [{ date: DAY, owner_auth: { by: 'host' } }] }, DAY).status, 'likely');
  assert.equal(C({ cancel_status: 'nope' }).status, 'likely');
  assert.equal(C({ canceled: true }).status, 'likely');
});

test('precedence: the date entry beats row-level cancel_status; row covers other dates; last entry wins', () => {
  const ev = { cancel_status: 'likely', cancel_reason: 'whole', canceled_dates: [{ date: DAY, cancel_status: 'confirmed', reason: 'day' }] };
  assert.deepEqual([C(ev, DAY).status, C(ev, DAY).whole, C(ev, DAY).note], ['confirmed', false, 'day']);
  assert.deepEqual([C(ev, '2026-11-12').status, C(ev, '2026-11-12').whole, C(ev, '2026-11-12').note], ['likely', true, 'whole']);
  assert.equal(C(ev).status, 'likely');
  assert.equal(C({ canceled_dates: [{ date: DAY, status: 'likely' }, { date: DAY, status: 'confirmed' }] }, DAY).status, 'confirmed');
});

test('malformed data never throws and never matches', () => {
  for (const cd of [null, 'x', 5, {}, [null], [5], [[DAY]], [{ date: 'Nov 5' }], [{}], ['2026-11-5']])
    assert.equal(C({ canceled_dates: cd }, DAY), null, JSON.stringify(cd));
  assert.equal(C(null, DAY), null); assert.equal(C({}, 'not-a-date'), null);
  assert.deepEqual(DEVCancel.normalizeCanceledDates(['2026-11-05', 'bad', { date: DAY, reason: 'x' }]).length, 2);
});

// The six live entries as of 2026-10-31 (public.event_listings), and what they showed before.
const LIVE = [
  ['monday-night-west-coast-swing-dance-party-ragon-hall', '2026-10-12', 'owner'],
  ['west-coast-wednesdays-in-july-2026', '2026-10-14', 'owner'],
  ['pcda-wednesday-night-round-up-ragon-hall', '2026-10-14', 'owner'],
  ['sensual-sundays-bachata-pensacola-coastals', '2026-10-11', 'confirmed'],
  ['sanders-beach-ballroom-weekly-classes', '2026-10-14', 'owner'],
  ['ttdgc-wild-gregs-country-swing-friday', '2026-10-09', 'likely'],
];
const REASON = 'Taking a short break due to the recent hurricane. Stay safe, see you next week!';
test('the six live entries keep their current label and note everywhere', () => {
  const src = readFileSync(new URL('../../dance-event-viewer/js/app.js', import.meta.url), 'utf8');
  const a = src.indexOf('function cancelLabelText('), b = src.indexOf('function applyCancelBanner(', a);
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../dance-event-viewer/js/cancel-core.js', import.meta.url), 'utf8'), ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.viewerCancel = cancellationFor;', ctx);
  for (const [key, date, status] of LIVE) {
    const ev = { key, cancel_status: null, canceled_dates: [{ date, reason: REASON, cancel_status: status }] };
    const viewer = ctx.viewerCancel(ev, vm.runInContext(`new Date(${date.slice(0, 4)}, ${+date.slice(5, 7) - 1}, ${+date.slice(8)}, 19)`, ctx));
    for (const c of [viewer, scheduleCancel(ev, date), C(ev, date)]) {
      assert.equal(c.status, status, key); assert.equal(c.label, DEVCancel.LABELS[status]); assert.equal(c.reason, REASON);
    }
    assert.equal(isCanceledOn(ev, date), true);
    // The next week is not canceled.
    const next = new Date(date + 'T12:00:00'); next.setDate(next.getDate() + 7);
    assert.equal(C(ev, next.toISOString().slice(0, 10)), null);
  }
});

const T = new Date(2026, 9, 31); // Sat Oct 31, 2026
test('event pages / hubs: every-other-week honors start_date anchor, end_date and exclude_dates', () => {
  const bi = { type: 'biweekly_recurring', day_of_week: 'Thursday', start_date: '2026-10-29' };
  assert.equal(nextOccurrence(bi, T), '2026-11-12');
  assert.equal(nextOccurrence({ ...bi, end_date: '2026-11-11' }, T), null);
  assert.equal(isPast({ ...bi, end_date: '2026-11-11' }, T), true);
  assert.equal(nextOccurrence({ ...bi, end_date: '2026-11-12' }, T), '2026-11-12');
  assert.equal(nextOccurrence({ ...bi, exclude_dates: ['2026-11-12'] }, T), '2026-11-26');
  assert.equal(nextOccurrence({ ...bi, start_date: '2026-12-03' }, T), '2026-12-03');
  assert.equal(nextOccurrence({ type: 'biweekly_recurring', day_of_week: 'Thursday' }, T), null); // no anchor: no guess
  // Matches the Gulf Coast simple view.
  assert.equal(simpleNext(bi, new Date(2026, 9, 31)).getDate(), 12);
});

test('event pages / hubs: weekly, monthly (Nth weekday and day-of-month) and one-time honor end_date', () => {
  const wk = { type: 'weekly_recurring', day_of_week: 'Thursday', end_date: '2026-10-29' }; // Moonshine today
  assert.equal(nextOccurrence(wk, T), null); assert.equal(isPast(wk, T), true);
  assert.equal(nextOccurrence({ ...wk, end_date: null }, T), '2026-11-05');
  const mo = { type: 'monthly_recurring', monthly_rule: 'First Friday of the month' };
  assert.equal(nextOccurrence(mo, T), '2026-11-06');
  assert.equal(nextOccurrence({ ...mo, end_date: '2026-11-01' }, T), null);
  const dom = { type: 'monthly_recurring', monthly_rule: '15th' };
  assert.equal(nextOccurrence(dom, T), '2026-11-15');
  assert.equal(nextOccurrence({ ...dom, end_date: '2026-11-14' }, T), null);
  assert.equal(nextOccurrence({ type: 'monthly_recurring', monthly_rule: '31' }, new Date(2026, 10, 1)), '2026-12-31'); // no Nov 31st: skipped, not moved
  assert.equal(isPast({ type: 'one_time', start_date: '2026-10-30', end_date: '2026-11-01' }, T), false);
  assert.equal(isPast({ type: 'one_time', start_date: '2026-10-30' }, T), true);
  assert.equal(nextOccurrence({ type: 'weekly_recurring', day_of_week: 'Funday', start_date: '2026-01-01' }, T), null);
});

test('/gulfcoast/ full mode: recurrence types honor end_date', () => {
  const bi = { type: 'biweekly_recurring', day_of_week: 'Thursday', start_date: '2026-10-29' };
  assert.deepEqual(['2026-10-29', '2026-11-05', '2026-11-12'].map(k => occursOn(bi, k)), [true, false, true]);
  assert.equal(occursOn({ ...bi, end_date: '2026-11-11' }, '2026-11-12'), false);
  assert.equal(occursOn({ type: 'weekly_recurring', day_of_week: 'Thursday', end_date: '2026-10-29' }, '2026-11-05'), false);
  assert.equal(occursOn({ type: 'monthly_recurring', monthly_rule: '15th' }, '2026-11-15'), true);
  assert.equal(occursOn({ type: 'monthly_recurring', monthly_rule: '15th', end_date: '2026-11-01' }, '2026-11-15'), false);
});

test('/gulfcoast/ full mode: results carry the cancellation for the shown date', () => {
  const base = { name: 'Moonshine', venue: 'Moonshine Saloon, Pensacola, FL', state: 'FL', style: 'Line Dance', type: 'weekly_recurring', day_of_week: 'Thursday' };
  const events = [
    { ...base, key: 'a', canceled_dates: [{ date: '2026-11-05', cancel_status: 'confirmed', reason: 'On break' }] },
    { ...base, key: 'b', canceled_dates: ['2026-11-12'] },
    { ...base, key: 'c' },
    { ...base, key: 'd', cancel_status: 'owner' },
  ];
  const out = Object.fromEntries(searchEvents(events, { place: 'all', when: '30', today: '2026-10-31' }).map(x => [x.event.key, x]));
  assert.equal(out.a.date, '2026-11-05'); assert.equal(out.a.cancel.label, 'CONFIRMED CANCELED'); assert.equal(out.a.cancel.note, 'On break');
  assert.equal(out.b.date, '2026-11-05'); assert.equal(out.b.cancel, null); // canceled on a later date only
  assert.equal(out.c.cancel, null);
  assert.equal(out.d.cancel.label, 'Officially canceled.');
});

test('feed and full-mode page ask for the cancel fields (read-only)', () => {
  assert.ok(FEED_FIELDS.includes('canceled_dates') && FEED_FIELDS.includes('cancel_status'));
  const app = readFileSync(new URL('../../gulfcoast/app.js', import.meta.url), 'utf8');
  assert.match(app, /select:'key,canceled_dates,cancel_status'/);
  assert.doesNotMatch(app, /method:\s*['"](POST|PATCH|PUT|DELETE)/i);
  const html = readFileSync(new URL('../../dance-event-viewer/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('js/cancel-core.js?v=') > 0 && html.indexOf('js/cancel-core.js?v=') < html.indexOf('js/app.js?v='), 'cancel-core.js loads before app.js');
});
