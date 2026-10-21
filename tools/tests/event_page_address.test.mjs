import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { eventWhere, eventMapsUrl } from '../lib.mjs';

const M = 'https://www.google.com/maps/search/?api=1&query=';

test('full address: venue, street, city, state; ZIP and notes dropped', () => {
  assert.equal(eventWhere('Las Floriditas, 111 Dauphin St, Mobile, AL 36602', 'AL'), 'Las Floriditas, 111 Dauphin St, Mobile, AL');
  assert.equal(eventWhere('The Chapel Collective, Suite 211, 1010 N 12th Ave, Pensacola, FL 32501 (East Hill neighborhood)', 'FL'),
    'The Chapel Collective, Suite 211, 1010 N 12th Ave, Pensacola, FL');
  assert.equal(eventMapsUrl('Las Floriditas, 111 Dauphin St, Mobile, AL 36602', 'AL'), M + encodeURIComponent('Las Floriditas, 111 Dauphin St, Mobile, AL'));
});

test('falls back to city / venue name and appends state once', () => {
  assert.equal(eventWhere('Orlando, FL', 'FL'), 'Orlando, FL');
  assert.equal(eventMapsUrl('Orlando, FL', 'FL'), M + 'Orlando%2C%20FL');
  assert.equal(eventWhere('Orlando', 'FL'), 'Orlando, FL');
  assert.equal(eventWhere('The Beer Hog - Madison, AL', 'AL'), 'The Beer Hog - Madison, AL');
  assert.equal(eventWhere('Hilton Cancun, Cancun, Mexico', null), 'Hilton Cancun, Cancun, Mexico');
});

test('never duplicates state or other parts', () => {
  assert.equal(eventWhere('Studio, 1 Main St, Tampa, FL, FL', 'FL'), 'Studio, 1 Main St, Tampa, FL');
  assert.equal(eventWhere('Studio, 1 Main St, Tampa, FL 33602, FL', 'FL'), 'Studio, 1 Main St, Tampa, FL');
  assert.equal(eventWhere('Tampa, Tampa, FL', 'fl'), 'Tampa, FL');
  assert.ok(!/FL, FL/.test(eventWhere('Tampa, FL 33602', 'FL')));
});

test('missing venue gives no Where line', () => {
  assert.equal(eventWhere('', 'FL'), '');
  assert.equal(eventWhere(null, 'FL'), '');
  assert.equal(eventMapsUrl(undefined, 'FL'), null);
});

test('generator uses the full-address helpers and wraps long addresses', () => {
  const src = readFileSync(new URL('../build_share_pages.mjs', import.meta.url), 'utf8');
  assert.match(src, /eventWhere\(ev\.venue, ev\.state\)/);
  assert.match(src, /eventMapsUrl\(ev\.venue, ev\.state\)/);
  assert.match(src, /\.meta\.where\{overflow-wrap:anywhere\}/);
});
