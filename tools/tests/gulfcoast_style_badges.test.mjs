// Style picker badges on /gulfcoast/. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const url = p => new URL('../../' + p, import.meta.url);

test('TripleTwo style option uses a 768x512 style badge like the rest of the set', () => {
  const src = readFileSync(url('gulfcoast/simple-flow.mjs'), 'utf8');
  assert.match(src, /'TripleTwo': 'triple-two\.png'/);
  const png = readFileSync(url('gulfcoast/assets/style-badges/triple-two.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [768, 512]);
});
