// Theme menu keyboard behavior (ARIA menu pattern): Up/Down move focus between options and wrap,
// Home/End jump to the ends, Escape closes and returns focus to the Theme button.
// Runs js/theme-switch.js in a tiny fake DOM. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../dance-event-viewer/', import.meta.url);
const src = readFileSync(new URL('js/theme-switch.js', root), 'utf8');
const html = readFileSync(new URL('index.html', root), 'utf8');
const values = [...html.matchAll(/class="theme-option" role="menuitemradio" data-theme-value="([a-z0-9]+)"/g)].map(m => m[1]);

function setup() {
  const docListeners = {};
  const doc = { readyState: 'complete', activeElement: null, documentElement: null,
    addEventListener(t, f) { (docListeners[t] ||= new Set()).add(f); },
    removeEventListener(t, f) { docListeners[t]?.delete(f); } };
  const el = (attrs = {}) => {
    const l = {};
    const e = { attrs: { ...attrs }, hidden: false, children: [], parent: null,
      getAttribute: k => (k in e.attrs ? e.attrs[k] : null), setAttribute: (k, v) => { e.attrs[k] = String(v); },
      addEventListener: (t, f) => { (l[t] ||= []).push(f); }, fire: (t, ev) => (l[t] || []).forEach(f => f(ev)),
      focus: () => { doc.activeElement = e; }, contains: x => x === e || e.children.includes(x),
      closest: sel => (sel === '.theme-option' && e.attrs.class === 'theme-option' ? e : sel === '.site-header' ? header : null),
      classList: { add() {}, remove() {} } };
    return e;
  };
  const header = el();
  doc.documentElement = el();
  const btn = el({ id: 'theme-switch-btn' });
  const menu = el({ id: 'theme-menu' }); menu.hidden = true;
  const opts = values.map(v => { const o = el({ class: 'theme-option', 'data-theme-value': v }); o.parent = menu; menu.children.push(o); return o; });
  menu.querySelectorAll = () => opts;
  doc.querySelectorAll = () => opts;
  doc.getElementById = id => (id === 'theme-switch-btn' ? btn : id === 'theme-menu' ? menu : null);
  doc.body = el(); doc.activeElement = doc.body;
  const store = {};
  const ctx = { document: doc, window: { DEV_SITE_DEFAULTS: { theme: 'mintreactor' } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  ctx.window.DEV_APPLY_BANNER = () => {};
  vm.runInNewContext(src, ctx);
  const key = k => { let prevented = false; const ev = { key: k, preventDefault: () => { prevented = true; } }; [...(docListeners.keydown || [])].forEach(f => f(ev)); return prevented; };
  const open = () => { btn.focus(); btn.fire('click', { stopPropagation() {} }); };
  return { doc, btn, menu, opts, key, open };
}

test('menu markup uses the menu / menuitemradio pattern', () => {
  assert.ok(values.length >= 2);
  assert.match(html, /id="theme-switch-btn"[^>]*aria-haspopup="true"[^>]*aria-controls="theme-menu"/);
  assert.match(html, /id="theme-menu" class="theme-menu" role="menu"/);
});

test('Down/Up from the Theme button enter the menu at the first/last option', () => {
  let t = setup(); t.open();
  assert.equal(t.menu.hidden, false);
  assert.equal(t.key('ArrowDown'), true);
  assert.equal(t.doc.activeElement, t.opts[0]);
  t = setup(); t.open(); t.key('ArrowUp');
  assert.equal(t.doc.activeElement, t.opts.at(-1));
});

test('Up/Down move between options and wrap at both ends; Home/End jump', () => {
  const t = setup(); t.open();
  t.key('ArrowDown'); t.key('ArrowDown');
  assert.equal(t.doc.activeElement, t.opts[1]);
  t.key('ArrowUp'); t.key('ArrowUp');
  assert.equal(t.doc.activeElement, t.opts.at(-1), 'Up from first wraps to last');
  t.key('ArrowDown');
  assert.equal(t.doc.activeElement, t.opts[0], 'Down from last wraps to first');
  t.key('End'); assert.equal(t.doc.activeElement, t.opts.at(-1));
  t.key('Home'); assert.equal(t.doc.activeElement, t.opts[0]);
});

test('selecting an option checks it, closes the menu, and refocuses the button', () => {
  const t = setup(); t.open(); t.key('ArrowDown'); t.key('ArrowDown');
  t.menu.fire('click', { target: t.opts[1] });   // Enter/Space on a <button> fires click
  assert.equal(t.opts[1].getAttribute('aria-checked'), 'true');
  assert.equal(t.menu.hidden, true);
  assert.equal(t.doc.activeElement, t.btn);
});

test('Escape closes and returns focus to the Theme button; arrows do nothing once closed', () => {
  const t = setup(); t.open(); t.key('ArrowDown'); t.key('ArrowDown');
  t.key('Escape');
  assert.equal(t.menu.hidden, true);
  assert.equal(t.btn.getAttribute('aria-expanded'), 'false');
  assert.equal(t.doc.activeElement, t.btn);
  assert.equal(t.key('ArrowDown'), false);
  assert.equal(t.doc.activeElement, t.btn);
});

test('Advanced drawer: Escape and the close button return focus to the Advanced button', () => {
  const app = readFileSync(new URL('js/app.js', root), 'utf8');
  assert.match(app, /getElementById\("filters-close"\)\?\.addEventListener\("click", \(\) => \{ setFiltersOpen\(false\); filtersToggle\.focus\(\); \}\)/);
  assert.match(app, /e\.key !== "Escape" \|\| !state\.filtersOpen[\s\S]{0,400}setFiltersOpen\(false\);\s*if \(refocus\) filtersToggle\.focus\(\);/);
});
