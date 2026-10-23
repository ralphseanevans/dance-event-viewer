// Gulf Coast card titles: no lone last word, no break at a hyphen ("Seaside Swing- | Outs").
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { titleParts } from '../../gulfcoast/simple-core.mjs';

const read = f => readFileSync(new URL('../../gulfcoast/' + f, import.meta.url), 'utf8');
const WJ = '\u2060';

test('titleParts keeps the last two words together and joins hyphenated words', () => {
  assert.deepEqual(titleParts('Friday Swing Dance with Seaside Swing-Outs'), ['Friday Swing Dance with ', 'Seaside Swing-' + WJ + 'Outs']);
  assert.deepEqual(titleParts('Halloween Dance with Seaside Swing-Outs'), ['Halloween Dance with ', 'Seaside Swing-' + WJ + 'Outs']);
  assert.deepEqual(titleParts('WCS Social Dance'), ['WCS ', 'Social Dance']);
  assert.deepEqual(titleParts('Something Different'), ['', 'Something Different']);
  assert.deepEqual(titleParts('Bachata'), ['Bachata', '']);
  assert.deepEqual(titleParts('  Pop-up   Social '), ['', 'Pop-' + WJ + 'up Social']);
  assert.deepEqual(titleParts(''), ['', '']);
  assert.deepEqual(titleParts(undefined), ['', '']);
  // Only hyphens between letters/digits: dashes, spaced hyphens and "-" at an edge are untouched.
  assert.deepEqual(titleParts('Salsa - Bachata Night'), ['Salsa - ', 'Bachata Night']);
  assert.deepEqual(titleParts('Two-Step 2-for-1'), ['', 'Two-' + WJ + 'Step 2-' + WJ + 'for-' + WJ + '1']);
  assert.deepEqual(titleParts('Ballroom – Latin'), ['Ballroom ', '– Latin']);
  // Text is unchanged apart from the invisible joiners and collapsed spaces.
  for (const t of ['Friday Swing Dance with Seaside Swing-Outs', 'Line Dancing at 3rd Planet Brewing', "David Miner's WCS Class"])
    assert.equal(titleParts(t).join('').replaceAll(WJ, ''), t);
});

test('the card renders titles through fillTitle with an inline-block tail; event data untouched', () => {
  const js = read('simple-flow.mjs');
  assert.match(js, /titleParts \} from '\.\/simple-core\.mjs\?v=/);
  assert.match(js, /function fillTitle\(el, text\) \{\n  const \[head, tail\] = titleParts\(text\);/);
  assert.match(js, /s\.className = 'tile-name-tail'/);
  assert.match(js, /name\.title = ev\.name;/, 'hover title keeps the original name');
  assert.doesNotMatch(js, /ev\.(card_title|name) = /, 'event data is never rewritten');
  const css = read('simple.css');
  assert.match(css, /\n\.tile-name\{text-wrap:balance\}\n/);
  assert.match(css, /\.tile-name-tail\{display:inline-block;max-width:100%;overflow-wrap:anywhere;text-decoration:inherit\}/);
  // The wide Full badge-card balance rule (organizer-badges.css) stays, and the card title rules keep overflow-wrap:anywhere as the last resort.
  assert.match(read('organizer-badges.css'), /\.tile-name\{text-wrap:balance\}/);
  assert.match(css, /\.tile-name\{margin:0 0 18px;font:700 [^}]*overflow-wrap:anywhere\}/);
  assert.match(css, /#simple-groups:not\(\[data-zoom="0"\]\) \.tile-name\{[^}]*overflow-wrap:anywhere\}/);
});
