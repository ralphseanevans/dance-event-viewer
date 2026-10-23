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

// Code only (comments stripped) so prose like "keeps browser history clean" is not flagged.
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const lbCode = stripComments(lb), flowCode = stripComments(js);
// Assigning location (or any navigating part of it, incl. bracket access and +=). A local
// `const location = ...` declaration (the tile's location row) is a different variable.
const LOCATION_WRITE = /(?<!\b(?:const|let|var)\s+)\blocation\s*(?:\.\s*(?:href|hash|search|pathname|host|hostname|port|protocol)|\[\s*['"`]\w+['"`]\s*\])?\s*\+?=(?!=)/;
const LOCATION_CALL = /\blocation\s*\.\s*(?:assign|replace|reload)\s*\(/;
const HISTORY = /\bhistory\b|pushState|replaceState/;
// Aliasing the location object (const L = location) is only useful for writing to it.
const LOCATION_ALIAS = /=\s*(?:(?:window|document|self|top)\s*\.\s*)?location\s*(?:[;,)]|$)/m;
const OPEN_SELF = /\bopen\s*\([^)]*['"`]_(?:self|top|parent)['"`]/;

test('never changes the URL', () => {
  // Reading location (new URL(src, location.href), origin checks) is fine; navigating is not.
  // Checked across the whole Gulf Coast flow module, not only the lightbox block.
  for (const [name, code] of [['lightbox', lbCode], ['simple-flow.mjs', flowCode]]) {
    assert.doesNotMatch(code, LOCATION_WRITE, `${name}: no location assignment`);
    assert.doesNotMatch(code, LOCATION_CALL, `${name}: no location navigation`);
    assert.doesNotMatch(code, HISTORY, `${name}: no history changes`);
    assert.doesNotMatch(code, LOCATION_ALIAS, `${name}: no location alias`);
    assert.doesNotMatch(code, OPEN_SELF, `${name}: no same-window open`);
  }
});

test('flyer file link downloads same-origin files and opens others in a new tab', () => {
  assert.match(html, /<a class="lb-file" target="_blank" rel="noopener noreferrer">/, 'cross-origin files never replace the page');
  assert.match(lb, /new URL\(pages\[page\], location\.href\)/, 'absolute URL of the stored file');
  assert.match(lb, /const local = source\.origin === location\.origin;/, 'download only for same-origin files');
  assert.match(lb, /local \? fileLink\.setAttribute\('download', ''\) : fileLink\.removeAttribute\('download'\)/);
  assert.equal((lbCode.match(/\bsetAttribute\s*\(\s*['"`]download['"`]/g) || []).length, 1, 'download is set only by the same-origin branch');
  assert.equal((lbCode.match(/\blocal\s*=(?!=)/g) || []).length, 1, 'local is computed once');
  assert.doesNotMatch(lbCode, /\.(?:target|rel)\s*=(?!=)|(?:set|remove)Attribute\s*\(\s*['"`](?:target|rel)['"`]/, 'JS keeps the link\'s target/rel');
});

test('full mode: whole flyer, uncropped, pinch-zoom allowed, scroll locked', () => {
  assert.match(css, /#simple-lightbox\.lb-full img\{[^}]*max-width:100%[^}]*object-fit:contain;touch-action:pinch-zoom/);
  assert.match(css, /\.lb-lock,\.lb-lock body\{overflow:hidden\}/);
});
