// Exp2 compact cards: orange folded corner flips one card to its flyer and back. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);
const css = read('simple.css');
const js = read('simple-flow.mjs');
// Own block, between the compact-card block and the fallback-flyer block.
const block = css.slice(css.indexOf('/* Compact flip corner'), css.indexOf('/* Fallback flyer'));
const C = '#simple-groups:not([data-zoom="0"])';
const tileFn = js.slice(js.indexOf('function tile('), js.indexOf('// ---------- flyer lightbox'));

test('flip block sits after the compact block and before the fallback flyer block', () => {
  const a = css.indexOf('/* Compact card view'), b = css.indexOf('/* Compact flip corner'), c = css.indexOf('/* Fallback flyer');
  assert.ok(a >= 0 && a < b && b < c, 'block order');
  assert.ok(block.length > 200);
  // The fallback flyer block alone (it ends at the next blank line), not every block after it.
  const end = css.indexOf('\n\n', c);
  assert.ok(end > c);
  assert.doesNotMatch(css.slice(c, end), /rotate|perspective/, 'fallback flyer block stays flat');
});

test('corner is a real button with aria-label, aria-pressed and a 44px tap target', () => {
  assert.match(tileFn, /createElement\('button'\); corner\.type = 'button'; corner\.className = 'tile-flip-corner'/);
  assert.match(tileFn, /corner\.setAttribute\('aria-pressed', String\(on\)\)/);
  assert.match(tileFn, /corner\.setAttribute\('aria-label', on \? 'Show details' : 'Show flyer'\)/);
  assert.match(tileFn, /setFlipped\(false\);/, 'starts face up with labels set');
  const rule = block.match(new RegExp(`\\${C.replace(/[()[\]"=]/g, m => '\\' + m)} \\.event-tile\\.has-real-flyer \\.tile-flip-corner\\{([^}]*)\\}`))[1];
  assert.match(rule, /width:44px;height:44px/); assert.match(rule, /position:absolute/); assert.match(rule, /top:0;left:0/);
  assert.ok(block.includes(`${C} .tile-flip-corner:focus-visible{`), 'visible keyboard focus');
});

test('corner is a folded triangle in the page red-orange accent, hidden on Full cards', () => {
  assert.match(block, /\.tile-flip-corner::before\{[^}]*background:var\(--red\);clip-path:polygon\(0 0,100% 0,0 100%\)/);
  assert.match(block, /^\.tile-flip-corner\{display:none\}$/m, 'Full cards never show it');
  assert.doesNotMatch(css.slice(0, css.indexOf('/* Compact card view')), /tile-flip-corner|is-flipped/, 'Full card CSS unchanged');
});

test('flip changes only this card and toggles back from the same corner', () => {
  assert.match(tileFn, /corner\.addEventListener\('click', e => \{ e\.preventDefault\(\); e\.stopPropagation\(\); setFlipped\(!a\.classList\.contains\('is-flipped'\)\); \}\)/);
  assert.match(tileFn, /a\.classList\.toggle\('is-flipped', on\)/);
  assert.doesNotMatch(tileFn, /querySelectorAll\(/, 'no cross-card changes from a tile');
  assert.match(tileFn, /a\.appendChild\(corner\)/, 'corner is on the card, above both faces');
  assert.match(block, /\.tile-flip-corner\{[^}]*z-index:3/);
});

test('hidden face is inert; back face is the real flyer', () => {
  assert.match(tileFn, /body\.inert = on;/);
  assert.match(tileFn, /preview\.inert = !on && !a\.classList\.contains\('flyer-open'\)/);
  assert.match(tileFn, /preview\.inert = !open && !a\.classList\.contains\('is-flipped'\)/, 'Full tab respects the flip');
  assert.match(js, /if \(flyers\.length\) \{[\s\S]*?\} else \{\s*preview = fallbackFlyer\(ev, day\);/);
});

test('back face fills the same card box (scales with zoom) and turns with rotateY', () => {
  const back = block.match(/\.event-tile\.has-flyer \.tile-flyer-preview\{([^}]*)\}/)[1];
  for (const d of ['position:absolute', 'inset:0', 'display:flex', 'backface-visibility:hidden', 'transform:rotateY(180deg)']) assert.ok(back.includes(d), d);
  assert.match(block, /\.event-tile\.has-flyer \.tile-body\{[^}]*backface-visibility:hidden;[^}]*transform:rotateY\(0deg\);transition:transform \.32s/);
  assert.ok(block.includes(`${C} .event-tile.has-flyer.is-flipped .tile-body{transform:rotateY(-180deg)}`));
  assert.ok(block.includes(`${C} .event-tile.has-flyer.is-flipped .tile-flyer-preview{transform:rotateY(0deg)}`));
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /perspective|zoom:/, 'flat flip; size comes from the card zoom');
});

test('reduced motion swaps the flip for a crossfade', () => {
  const rm = block.slice(block.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.ok(rm.length > 50);
  assert.match(rm, /transform:none!important;transition:opacity \.2s ease/);
  assert.match(rm, /\.is-flipped \.tile-flyer-preview\{opacity:1;visibility:visible/);
});

test('switching to Full cards turns flipped cards face up', () => {
  assert.match(js, /addEventListener\('card-zoom-change', \(\) => \{\s*if \(el\.groups\.dataset\.zoom === '0'\)[^\n]*flip-reset/);
  assert.match(tileFn, /a\.addEventListener\('flip-reset', \(\) => setFlipped\(false\)\)/);
});

test('Exp2 cache busters match content for the flip corner', () => {
  const html = read('index.html');
  assert.match(html, new RegExp(`simple\\.css\\?v=${sha8('simple.css')}`));
  assert.match(html, new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});

test('corner exists only on cards with a real flyer; fallback cards never flip', () => {
  assert.match(tileFn, /if \(flyers\.length\) \{\n    const corner = document\.createElement\('button'\)/, 'corner only built when a real flyer exists');
  assert.match(tileFn, /a\.classList\.add\('has-real-flyer'\)/);
  assert.match(tileFn, /a\.classList\.remove\('has-real-flyer'\); a\.querySelector\('\.tile-flip-corner'\)\?\.remove\(\)/, 'broken flyer drops the corner');
  assert.match(block, new RegExp(`\\.event-tile\\.has-real-flyer \\.tile-flip-corner\\{[^}]*display:block`));
  assert.doesNotMatch(block, /\)\s\.tile-flip-corner\{[^}]*display:block/, 'no rule shows the corner on every card');
});

test('flipped card shows the whole flyer in place: contain, no link, no card click', () => {
  assert.match(block, /\.tile-flyer-preview img\{[^}]*object-fit:contain/);
  assert.match(block, /\.event-tile\.has-flyer \.tile-flyer-preview\{[^}]*inset:0[^}]*background:#d8d0bd[^}]*overflow:hidden/, 'letterboxed on the card colour');
  assert.match(tileFn, /preview\.addEventListener\('click', e => \{ e\.preventDefault\(\); e\.stopPropagation\(\);/);
  assert.doesNotMatch(tileFn, /createElement\('a'\); [^\n]*tile-flyer-preview/, 'back image is not wrapped in a link');
  assert.match(tileFn, /preview = document\.createElement\('button'\); preview\.type = 'button'; preview\.className = 'tile-flyer-preview'/);
});
