import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../gulfcoast/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../gulfcoast/app.js', import.meta.url), 'utf8');

test('gulfcoast hero video does not loop', () => {
  const tag = html.match(/<video id="hero-video"[^>]*>/)[0];
  assert.doesNotMatch(tag, /\sloop[\s>]/);
  assert.match(app, /heroVideo\.loop=false/);
});

test('gulfcoast hero holds a final frame just before the end', () => {
  assert.match(app, /HERO_END_HOLD = 0\.\d+/);
  assert.match(app, /addEventListener\('ended',holdHeroFinalFrame\)/);
  assert.match(app, /heroMotion\.matches\)\{holdHeroFinalFrame\(\);return\}/);
});

test('gulfcoast app.js cache-bust was restamped', () => {
  assert.match(html, /app\.js\?v=[0-9a-f]{8}"/);
  assert.doesNotMatch(html, /app\.js\?v=662778b0/);
});
