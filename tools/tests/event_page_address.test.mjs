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

test('a city that already has its state does not also keep a metro city', () => {
  assert.equal(eventWhere('La Industria Mexican Grill, 3466 Holcomb Bridge Rd, Peachtree Corners, GA, Atlanta', 'GA'),
    'La Industria Mexican Grill, 3466 Holcomb Bridge Rd, Peachtree Corners, GA');
  assert.equal(eventWhere('VK Dance ARENA, 3129 W Hallandale Beach Blvd, Hallandale Beach, FL 33009, Miami', 'FL'),
    'VK Dance ARENA, 3129 W Hallandale Beach Blvd, Hallandale Beach, FL');
  assert.equal(eventWhere('W Fort Lauderdale, North Fort Lauderdale Beach Blvd, Fort Lauderdale, FL, Miami', 'FL'),
    'W Fort Lauderdale, North Fort Lauderdale Beach Blvd, Fort Lauderdale, FL');
  assert.equal(eventWhere('Walt Disney World Swan Reserve, 1255 Epcot Resorts Blvd, Lake Buena Vista, FL 32830, Orlando', 'FL'),
    'Walt Disney World Swan Reserve, 1255 Epcot Resorts Blvd, Lake Buena Vista, FL');
  assert.equal(eventWhere('Templo Dance Studio, 5644 Commerce Dr, Edgewood, FL 32839, Orlando', 'FL'),
    'Templo Dance Studio, 5644 Commerce Dr, Edgewood, FL');
  assert.equal(eventWhere('Pooler Ballroom, 301 US Hwy 80, Pooler, GA 31322, Savannah (Pooler)', 'GA'),
    'Pooler Ballroom, 301 US Hwy 80, Pooler, GA');
});

test('ZIP and a semicolon meetup note are dropped from the Where line and the map link', () => {
  const venue = 'Ragon Hall, 2600 Stratford Rd, Pensacola, FL 32526 (workshops & competitions); Beach Day meetup Fri 9am at Gulfside Pavilion, Casino Beach';
  assert.equal(eventWhere(venue, 'FL'), 'Ragon Hall, 2600 Stratford Rd, Pensacola, FL');
  assert.equal(eventMapsUrl(venue, 'FL'), M + encodeURIComponent('Ragon Hall, 2600 Stratford Rd, Pensacola, FL'));
  assert.equal(eventWhere('La Vie Dance and Culture, San Diego, CA (primary venue; Guerrilla Tango at Balboa Park)', 'CA'),
    'La Vie Dance and Culture, San Diego, CA');
  assert.equal(eventWhere("Lynn Warwick's House, West Mobile, AL — Contact Lynn for directions", 'AL'),
    "Lynn Warwick's House, West Mobile, AL");
  assert.equal(eventWhere("Washington, DC/VA (exact venue not listed on WSDC's event list -- see event website)", 'DC'),
    'Washington, DC/VA');
  assert.equal(eventWhere("Washington, DC/MD (exact venue not listed on WSDC's event list -- see event website)", 'DC'),
    'Washington, DC/MD');
  assert.equal(eventWhere('Royal Caribbean Ovation of the Seas, Port of Los Angeles, CA to Ensenada, CA', 'CA'),
    'Royal Caribbean Ovation of the Seas, Port of Los Angeles, CA to Ensenada, CA');
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
