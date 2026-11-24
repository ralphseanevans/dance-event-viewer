// Thanksgiving heads-up: only the occurrence calendar dates 2026-11-26 and 2026-11-27,
// and never on an occurrence that already has a cancellation. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import '../../dance-event-viewer/js/thanksgiving-note.js';
import '../../dance-event-viewer/js/cancel-core.js';
import { thanksgivingNote, iso } from '../../gulfcoast/simple-core.mjs';

const { DEVThanksgiving, DEVCancel } = globalThis;
const TEXT = '🦃 Check before going. This class may not be scheduled due to Thanksgiving.';
const noteFor = DEVThanksgiving.noteFor;
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const sha8 = (p) => createHash('sha1').update(readFileSync(new URL('../../' + p, import.meta.url))).digest('hex').slice(0, 8);

test('exact wording is the shared note text', () => {
  assert.equal(DEVThanksgiving.TEXT, TEXT);
  assert.deepEqual([...DEVThanksgiving.DATES], ['2026-11-26', '2026-11-27']);
});

test('calendar dates around Thanksgiving', () => {
  assert.equal(noteFor('2026-11-25'), null);
  assert.equal(noteFor('2026-11-26'), TEXT);
  assert.equal(noteFor('2026-11-27'), TEXT);
  assert.equal(noteFor('2026-11-28'), null);
  assert.equal(thanksgivingNote('2026-11-25'), null);
  assert.equal(thanksgivingNote('2026-11-26'), TEXT);
  assert.equal(thanksgivingNote('2026-11-27'), TEXT);
  assert.equal(thanksgivingNote('2026-11-28'), null);
});

test('local Date uses the civil day, not a UTC timestamp string', () => {
  assert.equal(noteFor(new Date(2026, 10, 25)), null);
  assert.equal(noteFor(new Date(2026, 10, 26)), TEXT);
  assert.equal(noteFor(new Date(2026, 10, 26, 0, 30)), TEXT);
  assert.equal(noteFor(new Date(2026, 10, 27)), TEXT);
  assert.equal(noteFor(new Date(2026, 10, 28)), null);
  assert.equal(thanksgivingNote(new Date(2026, 10, 26)), TEXT);
  assert.equal(iso(new Date(2026, 10, 26)), '2026-11-26');
  // Datetime strings are not calendar dates. Parsing them would shift the day
  // in timezones behind UTC (2026-11-26T00:00:00Z is still Nov 25 in the US).
  assert.equal(noteFor('2026-11-26T00:00:00.000Z'), null);
  assert.equal(noteFor('2026-11-26T00:00:00'), null);
  assert.equal(noteFor('11/26/2026'), null);
  assert.equal(noteFor(null), null);
  const src = read('dance-event-viewer/js/thanksgiving-note.js');
  const calendarDay = src.slice(src.indexOf('function calendarDay'), src.indexOf('function noteFor'));
  assert.match(calendarDay, /getFullYear\(\)/);
  assert.match(calendarDay, /getMonth\(\)/);
  assert.match(calendarDay, /getDate\(\)/);
  assert.doesNotMatch(calendarDay, /toISOString|getUTC/);
});

test('a canceled occurrence skips the note; a cancellation on another day does not', () => {
  assert.equal(noteFor('2026-11-26', true), null);
  assert.equal(noteFor('2026-11-27', { status: 'likely', label: 'LIKELY CANCELED' }), null);
  assert.equal(thanksgivingNote('2026-11-26', true), null);
  const thatNight = { canceled_dates: [{ date: '2026-11-26', cancel_status: 'confirmed', reason: 'Closed' }] };
  assert.equal(thanksgivingNote('2026-11-26', DEVCancel.cancellationFor(thatNight, '2026-11-26')), null);
  const otherNight = { canceled_dates: [{ date: '2026-11-19', cancel_status: 'owner' }] };
  assert.equal(DEVCancel.cancellationFor(otherNight, '2026-11-26'), null);
  assert.equal(thanksgivingNote('2026-11-26', DEVCancel.cancellationFor(otherNight, '2026-11-26')), TEXT);
  const wholeSeries = { cancel_status: 'owner' };
  assert.ok(DEVCancel.cancellationFor(wholeSeries, '2026-11-27'));
  assert.equal(thanksgivingNote('2026-11-27', DEVCancel.cancellationFor(wholeSeries, '2026-11-27')), null);
  assert.equal(noteFor('2026-11-25', true), null);
});

test('all three viewers render the shared note and pass the occurrence cancel flag', () => {
  const main = read('dance-event-viewer/js/app.js');
  const classic = read('gulfcoast/app.js');
  const tiles = read('gulfcoast/simple-flow.mjs');
  const core = read('gulfcoast/simple-core.mjs');
  assert.match(main, /DEVThanksgiving\.noteFor\(day, cancel\)/);
  assert.match(main, /thanksgivingNoteEl\(date instanceof Date \? date : d\.next, cancel\)/);
  assert.match(main, /className = "thanksgiving-note"/);
  assert.match(classic, /DEVThanksgiving\.noteFor\(date,cancel\)/);
  assert.match(classic, /class="thanksgiving-note"/);
  assert.match(classic, /thanksHtml\(date,cancel\)/);
  assert.match(tiles, /DEVThanksgiving\?\.noteFor\(day, canceled\)/);
  assert.match(tiles, /className = 'thanksgiving-note'/);
  assert.match(core, /export function thanksgivingNote\(day, canceled\)/);
  assert.match(core, /DEVThanksgiving\.noteFor\(day, canceled\)/);
  const viewer = read('dance-event-viewer/index.html');
  assert.ok(viewer.indexOf('js/thanksgiving-note.js?v=') > 0 && viewer.indexOf('js/thanksgiving-note.js?v=') < viewer.indexOf('js/app.js?v='));
  assert.match(viewer, new RegExp(`css/thanksgiving-note\\.css\\?v=${sha8('dance-event-viewer/css/thanksgiving-note.css')}`));
  assert.match(viewer, new RegExp(`js/thanksgiving-note\\.js\\?v=${sha8('dance-event-viewer/js/thanksgiving-note.js')}`));
  assert.match(viewer, new RegExp(`js/app\\.js\\?v=${sha8('dance-event-viewer/js/app.js')}`));
  const gulf = read('gulfcoast/index.html');
  assert.match(gulf, new RegExp(`thanksgiving-note\\.css\\?v=${sha8('dance-event-viewer/css/thanksgiving-note.css')}`));
  assert.match(gulf, new RegExp(`simple-flow\\.mjs\\?v=${sha8('gulfcoast/simple-flow.mjs')}`));
  assert.match(gulf, new RegExp(`app\\.js\\?v=${sha8('gulfcoast/app.js')}`));
  assert.match(tiles, new RegExp(`simple-core\\.mjs\\?v=${sha8('gulfcoast/simple-core.mjs')}`));
  assert.match(core, new RegExp(`thanksgiving-note\\.js\\?v=${sha8('dance-event-viewer/js/thanksgiving-note.js')}`));
  // The old experiments/experience-2 page only redirects to /gulfcoast/.
  const experiment = read('dance-event-viewer/experiments/experience-2/index.html');
  assert.match(experiment, /url=\.\.\/\.\.\/\.\.\/gulfcoast\//);
  assert.doesNotMatch(experiment, /simple-flow|thanksgiving-note/);
});
