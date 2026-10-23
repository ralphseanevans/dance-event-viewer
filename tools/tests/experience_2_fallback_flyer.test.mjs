// Exp2 fallback flyer: placeholder built from event data when no real flyer exists.
// It is switched off (SHOW_FALLBACK_FLYER = false): flyer-less cards show only their details,
// but the generator stays in place behind the flag. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fallbackFlyerData, flyersFor, hasRealFlyer, timeRange, scheduleEntries, SHOW_FALLBACK_FLYER, titleParts } from '../../gulfcoast/simple-core.mjs';

const dir = new URL('../../gulfcoast/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
// The fallback flyer CSS block alone: from its comment to the blank line that ends it.
const fallbackBlock = css => { const i = css.indexOf('/* Fallback flyer'); return i < 0 ? '' : css.slice(i, css.indexOf('\n\n', i) < 0 ? undefined : css.indexOf('\n\n', i)); };
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 8);

test('fills name, date, time, location and details from the event', () => {
  const d = fallbackFlyerData({ name: 'Monday WCS', style: 'West Coast Swing', start_time: '19:00', end_time: '22:30',
    venue: 'Ragon Hall, Pensacola, FL', cost: '$10', levels: ['Beginner'], instructors: ['Sam'] }, '2026-10-19');
  assert.equal(d.name, 'Monday WCS'); assert.equal(d.kicker, 'West Coast Swing');
  assert.equal(d.date, 'Mon, Oct 19'); assert.equal(d.time, '7:00 PM–10:30 PM');
  assert.equal(d.location, 'Ragon Hall, Pensacola, FL');
  assert.deepEqual(d.details, ['Beginner', 'With Sam', '$10']);
});

test('missing fields are dropped, never shown as filler', () => {
  const d = fallbackFlyerData({ name: '  Pop-up   Social ' }, 'not-a-date');
  assert.deepEqual(d, { kicker: 'Dance', name: 'Pop-up Social', date: '', time: '', location: '', details: [] });
  assert.equal(fallbackFlyerData({}, '2026-10-20').name, 'Dance night');
});

test('prefers card_title, address lines and cost_display when present', () => {
  const d = fallbackFlyerData({ name: 'Long', card_title: 'Short', venue: 'X', address_line_1: '1 Main St', address_line_2: 'Mobile, AL', cost: 'long text', cost_display: '$5' }, '2026-10-20');
  assert.equal(d.name, 'Short'); assert.equal(d.location, '1 Main St, Mobile, AL'); assert.deepEqual(d.details, ['$5']);
});

test('fallback flyer is off by default; the generator stays behind SHOW_FALLBACK_FLYER; real flyers still win', () => {
  assert.equal(SHOW_FALLBACK_FLYER, false, 'flag is off');
  assert.equal((read('simple-core.mjs').match(/SHOW_FALLBACK_FLYER =/g) || []).length, 1, 'flag is set in exactly one place');
  const js = read('simple-flow.mjs');
  assert.doesNotMatch(js, /SHOW_FALLBACK_FLYER =/, 'the viewer only reads the flag');
  assert.match(js, /const flyers = hasRealFlyer\(ev, state\.logoMap\) \?/, 'uses the shared real-flyer rule');
  assert.match(js, /if \(!flyers\.length && !SHOW_FALLBACK_FLYER\) \{ body\.appendChild\(links\); a\.appendChild\(body\); return a; \}/);
  // Generator kept, reachable only when the flag is on (no flyer, or a real image that fails).
  assert.match(js, /if \(flyers\.length\) \{[\s\S]*?\} else \{\s*preview = fallbackFlyer\(ev, day\);/);
  assert.match(js, /if \(!SHOW_FALLBACK_FLYER\) \{ preview\.remove\(\);[^\n]*\}\s*else \{ const fb = fallbackFlyer\(ev, day\);/);
  assert.doesNotMatch(js.slice(js.indexOf('function fallbackFlyer'), js.indexOf('function tile(')), /logo|<img|createElement\('img'\)/i);
});

test('fallback flyer CSS stays flat and uses the page variables', () => {
  const css = read('simple.css'); const block = fallbackBlock(css);
  assert.ok(block.length > 100);
  assert.doesNotMatch(block, /box-shadow|gradient|text-shadow|perspective|rotate/);
  for (const v of ['--paper', '--ink', '--red', '--display', '--body']) assert.ok(block.includes(`var(${v})`), v);
  // Kept for when the flag is turned back on, but it only styles fallback markup, which
  // is never rendered while SHOW_FALLBACK_FLYER is false, so it cannot affect the layout.
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@container[^{]*\{/g, '').match(/[^{}]+(?=\{)/g).map(x => x.trim()).filter(Boolean);
  for (const sel of selectors) assert.match(sel, /\.is-fallback|\.fallback-flyer|\.ff-/, sel);
  assert.equal(SHOW_FALLBACK_FLYER, false);
});

test('Exp2 cache busters match content for the fallback flyer', () => {
  assert.match(read('simple-flow.mjs'), new RegExp(`simple-core\\.mjs\\?v=${sha8('simple-core.mjs')}`));
  const html = read('index.html');
  assert.match(html, new RegExp(`simple\\.css\\?v=${sha8('simple.css')}`));
  assert.match(html, new RegExp(`simple-flow\\.mjs\\?v=${sha8('simple-flow.mjs')}`));
});

test('fallback flyer name clamps to 3 lines and pills/location never shrink out of the panel', () => {
  const css = read('simple.css');
  const rule = sel => (css.match(new RegExp(`(?:^|\\})\\${sel}\\{([^}]*)\\}`, "m")) || [])[1] || '';
  const name = rule('.ff-name');
  for (const d of ['display:-webkit-box', '-webkit-box-orient:vertical', 'overflow:hidden', '-webkit-line-clamp:3', 'min-height:0']) assert.ok(name.includes(d), d);
  assert.doesNotMatch(css, /\.ff-name[^{]*\{[^}]*-webkit-line-clamp:(?![123]\b)\d/, 'no name clamp above 3 lines');
  for (const sel of ['.ff-kicker', '.ff-when', '.ff-loc']) assert.ok(rule(sel).includes('flex:none'), sel + ' must not shrink');
});

// Runs the real tile() from simple-flow.mjs against a tiny stand-in DOM.
function buildTile(ev, { showFallback = SHOW_FALLBACK_FLYER } = {}) {
  const js = read('simple-flow.mjs');
  const src = js.slice(js.indexOf('// Placeholder flyer drawn'), js.indexOf('// ---------- flyer lightbox'));
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this.textContent = ''; this.parentElement = null; this.listeners = {};
      const self = this; this.classList = { add: (...c) => { const s = new Set(self.className.split(' ').filter(Boolean)); c.forEach(x => s.add(x)); self.className = [...s].join(' '); },
        remove: (...c) => { self.className = self.className.split(' ').filter(x => x && !c.includes(x)).join(' '); },
        contains: c => self.className.split(' ').includes(c), toggle(c, on) { on ? this.add(c) : this.remove(c); } }; }
    appendChild(c) { if (c.parentElement) c.parentElement.children = c.parentElement.children.filter(x => x !== c); c.parentElement = this; this.children.push(c); return c; }
    append(...cs) { cs.forEach(c => this.appendChild(c)); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); this.parentElement = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; } removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } dispatchEvent(e) { (this.listeners[e.type] || []).forEach(f => f(e)); }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    querySelector(sel) { const c = sel.replace(/^\./, ''); return this.all().find(n => n.className.split(' ').includes(c)) || null; }
    set innerHTML(v) { this._html = v; } get innerHTML() { return this._html || ''; }
  }
  const document = { createElement: t => new El(t) };
  const deps = { document, Event: class { constructor(type) { this.type = type; } }, URL, Intl, Date, state: { eventPages: new Set(), logoMap: null }, calendar: { highlightEvent() {} },
    SITE: 'https://danceeventviewer.net/', addCardBadge() {}, titleParts, timeRange, scheduleEntries, flyersFor, hasRealFlyer, fallbackFlyerData, resolve: p => p,
    SHOW_FALLBACK_FLYER: showFallback, trimFlyerBorder() {}, openLightbox() {} };
  const run = new Function(...Object.keys(deps), src + '\nreturn tile;')(...Object.values(deps));
  return run({ ev, canceled: false, day: '2026-10-27' });
}
const noFlyer = { key: 'david-miner-wcs', name: "David Miner's WCS Class", style: 'West Coast Swing', start_time: '19:00', end_time: '20:00',
  venue: 'David Miner Ballroom, 4130 Government Blvd, Mobile, AL', instructors: ['David Miner'] };

test('a no-flyer event renders no flyer panel, no flyer toggle and no flip corner', () => {
  const card = buildTile(noFlyer);
  for (const cls of ['tile-flyer-preview', 'fallback-flyer', 'tile-flyer-tab', 'tile-flip-corner', 'tile-turn-surface']) assert.equal(card.querySelector('.' + cls), null, cls);
  for (const cls of ['has-flyer', 'has-real-flyer', 'flyer-open']) assert.equal(card.classList.contains(cls), false, cls);
  assert.ok(!card.all().some(n => /flyer/i.test(n.textContent)), 'no "Show flyer"/"Hide flyer" text');
  const body = card.querySelector('.tile-body');
  assert.ok(body && body.parentElement === card, 'details are the whole card');
  const nm = body.querySelector('.tile-name'); assert.equal([nm, ...nm.all()].map(n => n.textContent).join('').replace(/\u2060/g, ''), noFlyer.name);
  assert.ok(body.querySelector('.tile-links'), 'links row kept');
});

test('cards with a real flyer still get the flyer panel, toggle and corner', () => {
  const card = buildTile({ ...noFlyer, flyer_url: 'https://example.com/flyer.jpg' });
  assert.ok(card.classList.contains('has-flyer') && card.classList.contains('has-real-flyer'));
  for (const cls of ['tile-flyer-preview', 'tile-flyer-tab', 'tile-flip-corner', 'tile-turn-surface']) assert.ok(card.querySelector('.' + cls), cls);
  assert.equal(card.querySelector('.fallback-flyer'), null);
});

test('turning SHOW_FALLBACK_FLYER back on restores the generated flyer (no corner)', () => {
  const card = buildTile(noFlyer, { showFallback: true });
  assert.ok(card.classList.contains('has-flyer'));
  assert.ok(card.querySelector('.fallback-flyer') && card.querySelector('.tile-flyer-tab'));
  assert.equal(card.querySelector('.tile-flip-corner'), null);
});
