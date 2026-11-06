import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../gulfcoast/simple.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../gulfcoast/index.html', import.meta.url), 'utf8');
const desktop = css.match(/@media\(min-width:821px\)\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('desktop calendar is a top-pinned bar, not a sidebar', () => {
  assert.match(desktop, /\.simple-results\{display:block\}/);
  assert.match(desktop, /\.calendar-sticky\{top:0;/);
  assert.match(css, /\.calendar-sticky\{position:sticky;/);
});

test('desktop calendar fits short windows', () => {
  assert.match(desktop, /max-height:calc\(100vh - 16px\)/);
  assert.match(desktop, /overflow-y:auto/);
});

test('phone calendar rules unchanged', () => {
  assert.match(css, /@media\(max-width:820px\)\{\n\.simple-results\{display:block;margin-top:30px\}\n\.scroll-calendar\{display:contents\}\n\.calendar-sticky\{top:0;z-index:5;margin:0 calc\(var\(--pad\) \* -1\) 18px;padding:8px var\(--pad\)\}/);
});

test('no ancestor overflow breaks sticky', () => {
  const style = readFileSync(new URL('../../gulfcoast/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(style, /(main|body|html)[^{]*\{[^}]*overflow(-y)?:(hidden|auto|scroll)/);
});

test('simple.css cache-bust restamped', () => {
  assert.doesNotMatch(html, /simple\.css\?v=505230a5/);
});
