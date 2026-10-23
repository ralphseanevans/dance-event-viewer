// Gulf Coast: tapping a flipped compact card's flyer opens the shared lightbox full screen. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const js = read('simple-flow.mjs'), css = read('simple.css'), html = read('index.html');
const lb = js.slice(js.indexOf('// ---------- flyer lightbox'), js.indexOf('Promise.all('));

test('flipped flyer opens one shared overlay in full mode; corner only flips', () => {
  assert.match(js, /openLightbox\(flyers, ev\.name, flipped \? a : preview, flipped\)/);
  assert.match(js, /corner\.addEventListener\('click', e => \{ e\.preventDefault\(\); e\.stopPropagation\(\); setFlipped/);
  assert.equal((html.match(/lb-close/g) || []).length, 1, 'one flyer overlay');
});

test('overlay is an accessible modal dialog with a 44px Close flyer button', () => {
  assert.match(html, /<dialog id="simple-lightbox" role="dialog" aria-modal="true"/);
  assert.match(html, /class="lb-close" type="button" aria-label="Close flyer"/);
  assert.match(css, /#simple-lightbox \.lb-close\{min-width:44px;min-height:44px\}/);
  assert.match(lb, /box\.showModal\(\); \$\('\.lb-close', box\)\.focus\(\)/, 'focus to X');
  assert.match(lb, /e\.target\.closest\('\.lb-close'\) \|\| e\.target === box\) box\.close\(\)/, 'X and backdrop close');
  assert.match(lb, /'close', \(\) => \{ document\.documentElement\.classList\.remove\('lb-lock'\); opener\?\.focus\(\)/, 'unlock + focus back');
});

test('never changes the URL', () => {
  // Reading location (e.g. new URL(src, location.href) or an origin check) is fine;
  // assigning it, calling navigation methods, or touching history is not.
  assert.doesNotMatch(lb, /\blocation\s*=(?!=)|\blocation\.(?:href|hash|search|pathname)\s*=(?!=)/, 'no location assignment');
  assert.doesNotMatch(lb, /\blocation\.(?:assign|replace|reload)\s*\(/, 'no location navigation');
  assert.doesNotMatch(lb, /\bhistory\b|pushState|replaceState|\.hash\s*=(?!=)/, 'no history/hash changes');
});

test('flyer file link downloads same-origin files and opens others in a new tab', () => {
  assert.match(html, /<a class="lb-file" target="_blank" rel="noopener noreferrer">/, 'cross-origin files never replace the page');
  assert.match(lb, /local \? fileLink\.setAttribute\('download', ''\) : fileLink\.removeAttribute\('download'\)/);
  assert.match(lb, /new URL\(pages\[page\], location\.href\)/, 'absolute URL of the stored file');
});

test('full mode: whole flyer, uncropped, pinch-zoom allowed, scroll locked', () => {
  assert.match(css, /#simple-lightbox\.lb-full img\{[^}]*max-width:100%[^}]*object-fit:contain;touch-action:pinch-zoom/);
  assert.match(css, /\.lb-lock,\.lb-lock body\{overflow:hidden\}/);
});
