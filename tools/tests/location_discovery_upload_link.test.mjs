// Find a Dance Near You (experiments/location-discovery): cards without a real flyer show only
// their details, with no dark stand-in box (Sean, Oct 22), plus a small "Upload a flyer" text link
// in the details that goes where the old button went (Sean's Oct 27 pick, Option A).
// Cards with a flyer are unchanged. Run from the repo root:  node --test tools/tests/
// app.js is a browser script, so the card builder is sliced out and run in a vm sandbox with a tiny fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DIR = new URL('../../dance-event-viewer/experiments/location-discovery/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');

class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.className = ''; this._text = ''; }
  append(...nodes) { for (const n of nodes) { if (n) { n.parent = this; this.children.push(n); } } }
  appendChild(n) { this.append(n); return n; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  all() { return this.children.flatMap((c) => (c instanceof El ? [c, ...c.all()] : [])); }
  find(cls) { return this.all().find((e) => e.className.split(' ').includes(cls)) || null; }
}

function loadMakeEventTile(logos) {
  const src = read('app.js');
  const start = src.indexOf('  function makeEventTile(');
  const end = src.lastIndexOf('})();');
  assert.ok(start > 0 && end > start, 'makeEventTile not found in app.js');
  const ctx = {
    URL,
    window: { location: { href: 'https://danceeventviewer.net/dance-event-viewer/experiments/location-discovery/' } },
    document: { createElement: (t) => new El(t), createTextNode: (t) => ({ textContent: String(t) }) },
  };
  vm.runInNewContext(`let logoMap = ${JSON.stringify({ logos, patterns: [] })};\n${src.slice(start, end)}\nthis.makeEventTile = makeEventTile;`, ctx);
  return ctx.makeEventTile;
}

const make = loadMakeEventTile({ 'has-flyer': 'graphics/x.png' });
const base = { name: 'Tuesday WCS', style: 'West Coast Swing', start_time: '19:00', venue: 'Hall, 1 Main St, Mobile, AL', cost: '$10' };

test('a card without a flyer has no flyer area, just details plus a small upload link', () => {
  const tile = make({ ...base, key: 'no-flyer' });
  assert.equal(tile.find('flyer-wrap'), null, 'no flyer wrapper');
  assert.equal(tile.find('flyer-placeholder'), null, 'no dark stand-in box');
  assert.equal(tile.children[0].className, 'event-name', 'the card starts with its title');
  const details = tile.find('event-details');
  const link = details.find('flyer-upload-link');
  assert.ok(link, 'upload link sits inside the details');
  assert.equal(link.tagName, 'A');
  assert.equal(link.textContent, 'Upload a flyer');
  assert.equal(link.href, 'https://danceeventviewer.net/dance-event-viewer/submit-event.html?event=no-flyer&purpose=flyer', 'same URL the old button used');
  assert.equal(link.getAttribute('aria-label'), 'Upload a flyer for Tuesday WCS');
});

test('a card with a flyer is unchanged: flyer first, no upload link', () => {
  const tile = make({ ...base, key: 'has-flyer' });
  assert.deepEqual(tile.children.map((c) => c.className), ['flyer-wrap', 'event-name', 'venue-block', 'event-details']);
  const img = tile.find('event-flyer');
  assert.equal(img.tagName, 'IMG');
  assert.equal(img.src, 'https://danceeventviewer.net/dance-event-viewer/graphics/x.png');
  assert.equal(img.loading, 'lazy');
  assert.equal(tile.find('flyer-upload-link'), null);
});

test('the dark box CSS is gone and the link is a small muted text link', () => {
  const css = read('styles.css');
  assert.doesNotMatch(css, /\.flyer-placeholder/);
  const rule = css.slice(css.indexOf('.flyer-upload-link {'), css.indexOf('}', css.indexOf('.flyer-upload-link {')));
  assert.match(rule, /color: var\(--muted\)/);
  assert.match(rule, /font-size: 13px/);
  assert.doesNotMatch(rule, /border|background|min-height/);
});
