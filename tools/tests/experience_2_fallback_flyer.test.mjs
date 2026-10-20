// Exp2 fallback flyer: placeholder built from event data when no real flyer exists. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fallbackFlyerData } from '../../dance-event-viewer/experiments/experience-2/simple-core.mjs';

const dir = new URL('../../dance-event-viewer/experiments/experience-2/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);

test('fills name, date, time, location and details from the event', () => {
  const d = fallbackFlyerData({ name: 'Monday WCS', style: 'West Coast Swing', start_time: '19:00', end_time: '22:30',
    venue: 'Ragon Hall, Pensacola, FL', cost: '$10', levels: ['Beginner'], instructors: ['Sam'] }, '2026-10-19');
  assert.equal(d.name, 'Monday WCS'); assert.equal(d.kicker, 'West Coast Swing');
  assert.equal(d.date, 'Mon, Oct 19'); assert.equal(d.time, '7:00 PM–10:30 PM');
  assert.equal(d.location, 'Ragon Hall, Pensacola, FL');
  assert.deepEqual(d.details, ['Beginner', 'With Sam', '$10']);
});

test('missing fields are dropped, never shown as filler', () => {
  const d = fallbackFlyerData({ name: '  Pop-up   Social ' }, 'not-a-date');
  assert.deepEqual(d, { kicker: 'Dance', name: 'Pop-up Social', date: '', time: '', location: '', details: [] });
  assert.equal(fallbackFlyerData({}, '2026-10-20').name, 'Dance night');
});

test('prefers card_title, address lines and cost_display when present', () => {
  const d = fallbackFlyerData({ name: 'Long', card_title: 'Short', venue: 'X', address_line_1: '1 Main St', address_line_2: 'Mobile, AL', cost: 'long text', cost_display: '$5' }, '2026-10-20');
  assert.equal(d.name, 'Short'); assert.equal(d.location, '1 Main St, Mobile, AL'); assert.deepEqual(d.details, ['$5']);
});

test('cards without a real flyer render the fallback; real flyers still win', () => {
  const js = read('simple-flow.mjs');
  assert.match(js, /if \(flyers\.length\) \{[\s\S]*?\} else \{\s*preview = fallbackFlyer\(ev, day\);/);
  assert.match(js, /image\.addEventListener\('error'[^\n]*fallbackFlyer\(ev, day\)/);
  assert.doesNotMatch(js.slice(js.indexOf('function fallbackFlyer'), js.indexOf('function tile(')), /logo|<img|createElement\('img'\)/i);
});

test('fallback flyer CSS stays flat and uses the page variables', () => {
  const css = read('simple.css'); const block = css.slice(css.indexOf('/* Fallback flyer'));
  assert.ok(block.length > 100);
  assert.doesNotMatch(block, /box-shadow|gradient|text-shadow|perspective|rotate/);
  for (const v of ['--paper', '--ink', '--red', '--display', '--body']) assert.ok(block.includes(`var(${v})`), v);
});

test('Exp2 cache busters match content for the fallback flyer', () => {
  assert.match(read('simple-flow.mjs'), new RegExp(`simple-core\\.mjs\\?v=${sha8('simple-core.mjs')}`));
  const html = read('index.html');
  assert.match(html, new RegExp(`simple\\.css\\?v=${sha8('simple.css')}`));
  assert.match(html, new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});
