// Gulf Coast card titles: no lone last word, no break at a hyphen ("Seaside Swing- | Outs"),
// and the title text in the DOM is exactly the event's title (no inserted characters).
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { titleParts, titleRuns } from '../../gulfcoast/simple-core.mjs';

const read = f => readFileSync(new URL('../../gulfcoast/' + f, import.meta.url), 'utf8');
const INVISIBLE = /[\u2060\u2011\u00ad\u200b-\u200d\ufeff]/;

// What the card puts in the DOM: head runs, then the tail span with its runs.
const render = t => titleParts(t).map(p => titleRuns(p));
const textOf = t => render(t).flat().map(r => r.text).join('');

test('titleParts keeps the last two words together, character for character', () => {
  assert.deepEqual(titleParts('Friday Swing Dance with Seaside Swing-Outs'), ['Friday Swing Dance with ', 'Seaside Swing-Outs']);
  assert.deepEqual(titleParts('Halloween Dance with Seaside Swing-Outs'), ['Halloween Dance with ', 'Seaside Swing-Outs']);
  assert.deepEqual(titleParts('WCS Social Dance'), ['WCS ', 'Social Dance']);
  assert.deepEqual(titleParts('Something Different'), ['', 'Something Different']);
  assert.deepEqual(titleParts('Bachata'), ['Bachata', '']);
  assert.deepEqual(titleParts('  Pop-up   Social '), ['  ', 'Pop-up   Social ']);
  assert.deepEqual(titleParts('Salsa - Bachata Night'), ['Salsa - ', 'Bachata Night']);
  assert.deepEqual(titleParts('Ballroom – Latin'), ['Ballroom ', '– Latin']);
  assert.deepEqual(titleParts(''), ['', '']);
  assert.deepEqual(titleParts(undefined), ['', '']);
});

test('titleRuns marks only letter-hyphen-letter words as no-break', () => {
  assert.deepEqual(titleRuns('Seaside Swing-Outs'), [{ text: 'Seaside ', nobr: false }, { text: 'Swing-Outs', nobr: true }]);
  assert.deepEqual(titleRuns('Two-Step 2-for-1 night'), [{ text: 'Two-Step', nobr: true }, { text: ' ', nobr: false }, { text: '2-for-1', nobr: true }, { text: ' night', nobr: false }]);
  assert.deepEqual(titleRuns('Salsa - Bachata -x y-'), [{ text: 'Salsa - Bachata -x y-', nobr: false }]);
  assert.deepEqual(titleRuns(''), []);
});

test('rendered title text equals the original title exactly, with no U+2060 / U+2011 or other invisible characters', () => {
  const events = JSON.parse(readFileSync(new URL('../../dance_events.json', import.meta.url), 'utf8'));
  const list = (Array.isArray(events) ? events : events.events || []).flatMap(e => [e.card_title, e.name]).filter(t => typeof t === 'string');
  const titles = [...new Set([...list, 'Friday Swing Dance with Seaside Swing-Outs', 'Halloween Dance with Seaside Swing-Outs', "David Miner's WCS Class",
    'Line Dancing at 3rd Planet Brewing', '  Pop-up   Social ', 'Two-Step 2-for-1', 'Bachata', '', 'Ballroom – Latin'])];
  assert.ok(titles.length > 100, 'real titles were checked too');
  for (const t of titles) {
    assert.equal(textOf(t), t, JSON.stringify(t));
    for (const r of render(t).flat()) assert.doesNotMatch(r.text, INVISIBLE, JSON.stringify(t));
  }
  for (const f of ['simple-core.mjs', 'simple-flow.mjs']) assert.doesNotMatch(read(f), /\\u2060|\\u2011|\u2060|\u2011/, f + ' inserts no joiner');
});

test('the card renders titles as plain inline nowrap spans (no inline-block), event data untouched', () => {
  const js = read('simple-flow.mjs');
  assert.match(js, /titleParts, titleRuns \} from '\.\/simple-core\.mjs\?v=/);
  assert.match(js, /function fillTitle\(el, text\) \{\n  const \[head, tail\] = titleParts\(text\);/);
  assert.match(js, /s\.className = 'tile-name-tail'/);
  assert.match(js, /s\.className = 'tile-name-nobr'/);
  assert.match(js, /document\.createTextNode\(r\.text\)/);
  assert.match(js, /body\.appendChild\(name\);\n  watchTitle\(name\);/);
  assert.match(js, /name\.title = ev\.name;/, 'hover title keeps the original name');
  assert.doesNotMatch(js, /ev\.(card_title|name) = /, 'event data is never rewritten');
  const css = read('simple.css');
  assert.match(css, /\n\.tile-name\{text-wrap:balance\}\n/);
  assert.match(css, /\n\.tile-name-tail,\.tile-name-nobr\{white-space:nowrap\}\n/);
  assert.match(css, /\.tile-name\.loose-tail \.tile-name-tail,\.tile-name\.loose-all \.tile-name-nobr\{white-space:normal;overflow-wrap:anywhere\}/);
  assert.doesNotMatch(css, /\.tile-name-(tail|nobr)[^{]*\{[^}]*display:inline-block/, 'inline-block breaks Ctrl+F across the title and the underline');
  // The wide Full badge-card balance rule (organizer-badges.css) stays, and the card title rules keep overflow-wrap:anywhere as the last resort.
  assert.match(read('organizer-badges.css'), /\.tile-name\{text-wrap:balance\}/);
  assert.match(css, /\.tile-name\{margin:0 0 18px;font:700 [^}]*overflow-wrap:anywhere\}/);
  assert.match(css, /#simple-groups:not\(\[data-zoom="0"\]\) \.tile-name\{[^}]*overflow-wrap:anywhere\}/);
});

// QA #77 at 7a06cbc: on a 390x844 phone, Next → November, tap 22 enlarged 21 and the Nov 22 heading landed at
// 425.6 instead of main's 380.6, because .loose-tail was only added ~360ms later by the ResizeObserver, after the
// calendar had measured the jump. Title fitting must run synchronously in render(), after the tiles are in the
// DOM and before calendar.set() / the jump (onJump calls render() then scrollIntoView immediately).
// Browser repro: tools/browser/gulfcoast_phone_tap.mjs.
test('title fitting runs synchronously on render, before the calendar measures the jump', () => {
  const js = read('simple-flow.mjs');
  const body = js.slice(js.indexOf('function render('), js.indexOf('\n}\n', js.indexOf('function render(')));
  const insert = body.indexOf('el.groups.replaceChildren(...blocks);');
  const fit = body.indexOf("fitTitles([...el.groups.querySelectorAll('.tile-name')]);");
  const cal = body.indexOf('calendar.set(groups.map(g => g.day)');
  assert.ok(insert > 0 && fit > insert && cal > fit, 'render(): replaceChildren(...blocks) → fitTitles(...) → calendar.set(...)');
  assert.doesNotMatch(body.slice(insert, fit), /requestAnimationFrame|setTimeout|await|\.then\(/, 'fit is not deferred');
  // The jump scrolls straight after render(), so the fit must already be done by then.
  assert.match(js, /render\(\); \}\n    \}\n    if \(state\.dateRanges\.length\)[^\n]*\n    document\.getElementById\(`simple-date-\$\{day\}`\)\?\.scrollIntoView/);
  // The late paths stay as fallbacks for width changes and web-font swaps.
  assert.match(js, /new ResizeObserver\(/);
  assert.match(js, /document\.fonts\?\.ready\.then\(\(\) => fitTitles\(/);
});
