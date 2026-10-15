// Canceled occurrences sort to the end of their day group (2026-10-14, DEV Design).
// Run from the repo root:  node --test tools/tests/
// app.js is a browser script, so the cancel helpers and sortCanceledLast are sliced out of
// the source and evaluated in a vm sandbox. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../dance-event-viewer/js/app.js', import.meta.url), 'utf8');
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `block ${from} not found in app.js`);
  return src.slice(a, b);
}
const ctx = vm.createContext({});
vm.runInContext(
  slice('const CANCEL_BANNER_LABELS', 'function applyCancelBanner(') +
  slice('function sortCanceledLast(', 'function bucketize(') +
  '\nthis.sortCanceledLast = sortCanceledLast;', ctx);

// Built inside the sandbox so app.js's `instanceof Date` check sees its own Date.
const night = vm.runInContext('new Date(2026, 9, 14, 19, 0)', ctx);
const item = (key, extra = {}) => ({ ev: { key, name: key, ...extra }, next: night });

test('canceled occurrences move to the end, others keep their order', () => {
  const items = [
    item('a'),
    item('b', { canceled_dates: [{ date: '2026-10-14', cancel_status: 'owner', reason: 'Hurricane' }] }),
    item('c'),
    item('d', { canceled_dates: ['2026-10-14'] }),
    item('e'),
  ];
  assert.deepEqual([...ctx.sortCanceledLast(items)].map(d => d.ev.key), ['a', 'c', 'e', 'b', 'd']);
});

test('a cancellation on a different date does not move the card', () => {
  const items = [item('x', { canceled_dates: ['2026-10-21'] }), item('y')];
  assert.deepEqual([...ctx.sortCanceledLast(items)].map(d => d.ev.key), ['x', 'y']);
});

test('whole-event cancel_status also sorts last; input is not mutated', () => {
  const items = [item('p', { cancel_status: 'confirmed' }), item('q')];
  const out = ctx.sortCanceledLast(items);
  assert.deepEqual([...out].map(d => d.ev.key), ['q', 'p']);
  assert.equal(items[0].ev.key, 'p');
});
