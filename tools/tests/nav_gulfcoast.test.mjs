import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
const r = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('viewer nav no longer has "Find a Dance Near You"', () => {
  const html = r('dance-event-viewer/index.html');
  const nav = /<div class="header-actions">([\s\S]*?)<\/div>/.exec(html)[1];
  assert.doesNotMatch(html, /Find a Dance Near You/);
  assert.doesNotMatch(nav, /location-discovery/);
  assert.match(nav, /Submit an Event/);
  assert.match(nav, /Edit Events/);
});

test('Gulf Coast pill is filled, bold and flat', () => {
  const css = r('dance-event-viewer/css/styles.css');
  const rule = /\.experimental-viewer-link\.nav-gulfcoast\s*\{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /background:\s*#2ec4b6/);
  assert.match(rule, /font-weight:\s*800/);
  assert.doesNotMatch(rule, /shadow|gradient/);
});

test('styles.css cache-buster matches content hash', () => {
  const h = createHash('sha1').update(readFileSync(new URL('../../dance-event-viewer/css/styles.css', import.meta.url))).digest('hex').slice(0, 8);
  for (const p of ['dance-event-viewer/index.html', 'dance-event-viewer/submit-event.html'])
    assert.match(r(p), new RegExp(`css/styles\\.css\\?v=${h}`), p);
});
