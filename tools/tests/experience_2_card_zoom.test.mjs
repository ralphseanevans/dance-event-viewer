// Exp2 compact card view: zoom levels, 12px text floor, single-line cards. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clampZoom, ZOOM_NAMES, DEFAULT_ZOOM } from '../../dance-event-viewer/experiments/experience-2/card-zoom.mjs';

const dir = new URL('../../dance-event-viewer/experiments/experience-2/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const css = read('simple.css');
const compact = css.slice(css.indexOf('/* Compact card view'));

test('zoom level parsing falls back to the 100% compact default', () => {
  assert.equal(DEFAULT_ZOOM, 1); assert.equal(ZOOM_NAMES[DEFAULT_ZOOM], '100%');
  for (const bad of [null, '', 'abc', undefined]) assert.equal(clampZoom(bad), 1);
  assert.equal(clampZoom('0'), 0); assert.equal(clampZoom('3'), 3); assert.equal(clampZoom('9'), 3); assert.equal(clampZoom('-2'), 0);
});

test('smallest compact text renders at 12px or more at every zoom level', () => {
  const floor = Number(compact.match(/--card-floor:([\d.]+)/)[1]);
  const base = Number(compact.match(/calc\(([\d.]+) \* var\(--scale\)\)/)[1]);
  const scales = [...compact.matchAll(/--scale:([\d.]+)/g)].map(m => Number(m[1]));
  const sizes = compact.split('\n').filter(l => /tile/.test(l)).flatMap(l => [...l.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g)].map(m => Number(m[1])));
  const smallest = Math.min(...sizes);
  assert.ok(scales.length >= 3);
  for (const s of scales) assert.ok(Math.max(floor, base * s) * smallest >= 12 - 1e-9, `scale ${s}`);
});

test('desktop default shows 6 across and zooming out adds columns', () => {
  assert.match(compact, /data-zoom="1"\]\{--scale:1;--cols:6\}/);
  assert.match(compact, /data-zoom="2"\]\{--scale:\.85;--cols:7\}/);
  assert.match(compact, /data-zoom="3"\]\{--scale:\.7;--cols:8\}/);
});

test('compact card text stays on one line with an ellipsis', () => {
  assert.match(compact, /\.tile-name[^{}]*\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
});

test('card-zoom module is cache-busted by content hash', () => {
  const sha8 = createHash('sha1').update(readFileSync(new URL('card-zoom.mjs', dir))).digest('hex').slice(0, 8);
  assert.match(read('simple-flow.mjs'), new RegExp(`card-zoom\\.mjs\\?v=${sha8}`));
});
