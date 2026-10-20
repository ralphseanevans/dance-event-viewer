// Gulf Coast page Simple mode: four-market attribution. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETS, OTHER, SIMPLE_CONTROL_ORDER, marketOf } from '../../gulfcoast/markets.mjs';

const m = (venue, state = 'FL') => marketOf({ venue, state });

test('market order is Pensacola, Mobile, Destin, Panama City Beach, then Other', () => {
  assert.deepEqual(MARKETS.map(x => x.label), ['Pensacola', 'Mobile', 'Destin', 'Panama City Beach']);
  assert.equal(OTHER.label, 'Other');
  assert.deepEqual(SIMPLE_CONTROL_ORDER, ['where', 'styles', 'when', 'cards']);
});

test('Pensacola and Mobile follow the main viewer', () => {
  assert.equal(m("Señor Frog's, Boardwalk, Pensacola Beach, FL 32561"), 'pensacola');
  assert.equal(m('Las Floriditas, Mobile, AL', 'AL'), 'mobile');
});

test('Destin keeps the 30A / Santa Rosa Beach / Miramar Beach rule', () => {
  for (const town of ['Destin', 'Santa Rosa Beach', 'Miramar Beach', 'Seaside', 'Fort Walton Beach', 'Niceville', 'Rosemary Beach'])
    assert.equal(m(`Hall, 1 Main St, ${town}, FL`), 'destin', town);
  assert.equal(m('Luna Ballroom, 4552 US Highway 98 W, Suites 7-8, Santa Rosa Beach, FL 32459'), 'destin');
  assert.equal(m('Seaside Ballroom, Seaside, OR 97138', 'OR'), null);
});

test('Panama City Beach covers PCB, Laguna Beach and Inlet Beach', () => {
  assert.equal(m('Studio, Panama City Beach, FL 32407'), 'pcb');
  assert.equal(m('Club, 100 Front Beach Rd, Panama City Beach, FL'), 'pcb');
  assert.equal(m('Hall, Laguna Beach, FL'), 'pcb');
  assert.equal(m('Hall, Inlet Beach, FL'), 'pcb');
  assert.equal(m('Hall, 1 Rd, Somewhere, FL 32413'), 'pcb');
  assert.equal(m('Hall, 1 Rd, Somewhere, FL 32408'), 'pcb');
});

test('Panama City proper, Lynn Haven and Callaway stay under Other', () => {
  assert.equal(m('Venue, 32459 Old Rd, Panama City, FL 32401'), null);
  assert.equal(m('Hall, Lynn Haven, FL 32444'), null);
  assert.equal(m('Hall, Callaway, FL 32404'), null);
  assert.equal(m('Hall, Laguna Beach, CA 92651', 'CA'), null);
});
