// Area attribution (Pensacola / Mobile / Destin chips) from dance-event-viewer/js/app.js.
// Run from the repo root:  node --test tools/tests/
// app.js is a browser script, so the location block (US_STATES .. isDestinAreaVenue) is
// sliced out of the source and evaluated in a vm sandbox. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = new URL('../../dance-event-viewer/js/app.js', import.meta.url);

export function loadLocationOf(source = readFileSync(APP, 'utf8')) {
  const start = source.indexOf('const US_STATES');
  const end = source.indexOf('function kindOf(');
  assert.ok(start >= 0 && end > start, 'location block not found in app.js');
  const ctx = {};
  vm.runInNewContext(`${source.slice(start, end)}\nthis.locationOf = locationOf;`, ctx);
  return ctx.locationOf;
}
const locationOf = loadLocationOf();
const area = (venue, state = 'FL') => locationOf({ venue, state }).area;

test('Luna Ballroom (Santa Rosa Beach 32459) is Destin area with or without the "(Destin area)" stopgap', () => {
  assert.equal(area('Luna Ballroom, 4552 US Highway 98 W, Suites 7-8, Santa Rosa Beach, FL 32459'), 'Destin area');
  assert.equal(area('Luna Ballroom, 4552 US Highway 98 W, Suites 7-8, Santa Rosa Beach (Destin area), FL 32459'), 'Destin area');
});

test('every 30A / south Walton / Okaloosa town counts as Destin area', () => {
  for (const town of ['Santa Rosa Beach', 'Miramar Beach', 'Sandestin', 'Seaside', 'WaterColor', 'Grayton Beach',
    'Blue Mountain Beach', 'Dune Allen', 'Seagrove Beach', 'Inlet Beach', 'Rosemary Beach', 'Alys Beach',
    'Watersound', 'Freeport', 'DeFuniak Springs', 'Niceville', 'Fort Walton Beach', 'Ft Walton Beach',
    'Ft. Walton Beach', 'Okaloosa Island', 'Mary Esther', 'Shalimar', 'Valparaiso', 'Crestview', 'Destin']) {
    assert.equal(area(`Some Hall, 1 Main St, ${town}, FL`), 'Destin area', town);
  }
});

test('area ZIPs count only as the trailing FL ZIP', () => {
  for (const zip of ['32459', '32550', '32461', '32413', '32439', '32433', '32541', '32547', '32548', '32549',
    '32569', '32579', '32578', '32580', '32536', '32539']) {
    assert.equal(area(`Venue, 1 Main St, Somewhere, FL ${zip}`), 'Destin area', zip);
  }
  assert.equal(area('Venue, 32550 Hwy 98, Panama City Beach, FL 32413-1234'), 'Destin area');
  assert.equal(area('Venue, 32459 Old Rd, Panama City, FL 32401'), 'Elsewhere / unlisted', 'street number is not a ZIP');
});

test('whole words only, and nothing outside the area is pulled in', () => {
  assert.equal(area('Destiny Church, 10 Elm St, Tallahassee, FL 32301'), 'Elsewhere / unlisted');
  assert.equal(area('Seasideways Club, Panama City Beach, FL 32407'), 'Elsewhere / unlisted');
  assert.equal(area('Watercolors Studio, Gainesville, FL 32601'), 'Elsewhere / unlisted');
  assert.equal(area('Seaside Ballroom, Seaside, OR 97138', 'OR'), 'Elsewhere / unlisted');
  assert.equal(area('Dance Hall, Freeport, TX 77541', 'TX'), 'Elsewhere / unlisted');
  assert.equal(area('Dance Hall, Valparaiso, IN 46383', 'IN'), 'Elsewhere / unlisted');
  assert.equal(area('Studio, Panama City Beach, FL 32407'), 'Elsewhere / unlisted');
  assert.equal(area('Studio, Tallahassee, FL 32459', 'GA'), 'Elsewhere / unlisted');
});

test('Pensacola and Mobile attribution unchanged', () => {
  assert.equal(area('Señor Frog\'s, Boardwalk, Pensacola Beach, FL 32561'), 'Pensacola area');
  assert.equal(area('Las Floriditas, Mobile, AL', 'AL'), 'Mobile area');
});
