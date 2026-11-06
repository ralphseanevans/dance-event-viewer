// Gulf Coast calendar: tapping the first day of a list page that isn't drawn yet (QA: Nov 22 then
// Nov 23 on phones; Nov 12 / Nov 23 on desktop) must enlarge the tapped day. The tap redraws the list
// and builds a new IntersectionObserver whose first report can carry a stale entry for the day above.
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.style = { setProperty() {} }; this.textContent = ''; this.className = ''; this.listeners = {}; this.rect = { top: 2000, bottom: 2500, height: 100 }; }
  get classList() { const el = this; return { toggle(c, on) { const set = new Set(el.className.split(' ').filter(Boolean)); (on ?? !set.has(c)) ? set.add(c) : set.delete(c); el.className = [...set].join(' '); }, contains: c => el.className.split(' ').includes(c) }; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); }
  replaceChildren(...c) { this.children = c; }
  addEventListener(t, f) { this.listeners[t] = f; }
  closest(s) { return this.tagName === 'button' && this.dataset.date ? this : null; }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll(sel) { return sel === 'button[data-date]' ? this.children.filter(c => c.tagName === 'button') : []; }
  querySelector() { return null; }
}
const winL = {};
globalThis.document = { createElement: t => new El(t), addEventListener() {}, documentElement: { tag: 'html' } };
globalThis.window = { addEventListener(t, f) { (winL[t] ||= []).push(f); }, innerHeight: 844, scrollY: 0 };
globalThis.getComputedStyle = x => x?.tag === 'html' ? { scrollPaddingTop: '90px' } : { position: 'relative', scrollMarginTop: '291px' };
globalThis.requestAnimationFrame = () => 1;
const observers = [];
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} };
const fire = t => (winL[t] || []).forEach(f => f({}));

const { createStickyCalendar } = await import('../../gulfcoast/sticky-calendar.mjs');

function make(onJump) {
  const parts = { '.calendar-month-label': new El('div'), '.calendar-prev': new El('button'), '.calendar-next': new El('button'), '.calendar-days': new El('div'), '.calendar-sticky': new El('div') };
  const root = new El('div'); root.querySelector = s => parts[s] || null;
  const cal = createStickyCalendar({ root, scrollHost: new El('div'), onJump: d => onJump(cal, d) });
  const grid = parts['.calendar-days'];
  return { cal, grid, active: () => grid.children.find(c => c.className.includes('is-active'))?.dataset.date, tap: d => grid.listeners.click({ target: grid.children.find(c => c.dataset.date === d), preventDefault() {} }) };
}
// Phone 390x844: a tapped heading lands at 90 + 291 = 381px; the spy band is 383..384px.
const b22 = new El('section'), b23 = new El('section');
b22.dataset.date = '2026-11-22'; b23.dataset.date = '2026-11-23';
const at = (top, el) => { el.rect = { top, bottom: top + 500, height: 500 }; };

test('tap on the first day of an undrawn page: a stale observer entry for the day above is ignored', () => {
  const days = ['2026-11-22', '2026-11-23'];
  const { cal, active, tap } = make((cal, d) => {
    // simple-flow: reveal the next page (new blocks -> new observer), then the smooth scroll moves it to the landing line
    cal.set(days, [b22, b23]); at(-118.4, b22); at(381.6, b23); window.scrollY += 500;
  });
  cal.set(days, [b22]); at(380.6, b22); at(880.6, b23); tap('2026-11-22');
  fire('scroll'); fire('scrollend');
  assert.equal(active(), '2026-11-22');
  tap('2026-11-23');
  assert.equal(active(), '2026-11-23');
  const stale = [{ target: b22, isIntersecting: true, boundingClientRect: { top: 380.6 } }, { target: b23, isIntersecting: true, boundingClientRect: { top: 381.6 } }];
  observers.at(-1).cb(stale); // while the jump is still scrolling
  assert.equal(active(), '2026-11-23');
  fire('scroll'); fire('scrollend');
  observers.at(-1).cb(stale); // QA trace: the first report arrived ~1.3s after the tap, after the scroll ended
  assert.equal(active(), '2026-11-23', 'tapped day must stay enlarged');
  // Hand scrolling afterwards still tracks the list, from live positions (not the stale entry tops).
  window.scrollY -= 200; at(81.6, b22); at(581.6, b23);
  observers.at(-1).cb([{ target: b23, isIntersecting: false, boundingClientRect: { top: 381.6 } }]);
  assert.equal(active(), '2026-11-22');
  window.scrollY += 200; at(-118.4, b22); at(381.6, b23);
  observers.at(-1).cb([{ target: b22, isIntersecting: true, boundingClientRect: { top: 380.6 } }]);
  assert.equal(active(), '2026-11-23');
});

test('spy is held from the tap until scrollend (or a short idle fallback) and reads live rects', () => {
  const js = readFileSync(new URL('../../gulfcoast/sticky-calendar.mjs', import.meta.url), 'utf8');
  assert.match(js, /active = tapped = day; shownMonth = day\.slice\(0, 7\); holdSpy\(\);/);
  assert.match(js, /addEventListener\('scrollend', releaseSpy\)/);
  assert.match(js, /setTimeout\(releaseSpy, 200\)/);
  assert.match(js, /new IntersectionObserver\(pick, /);
  assert.match(js, /function pick\(\)[\s\S]*?getBoundingClientRect\(\)/);
  assert.doesNotMatch(js, /entries\.filter\(x => x\.isIntersecting\)\.sort/);
});

test('clicking ANY day jumps: a no-event day lands on (and enlarges) the next day with events', () => {
  const jumps = [];
  const { cal, active, tap, grid } = make((cal, d) => jumps.push(d));
  cal.set(['2026-10-23', '2026-10-25', '2026-11-01'], []);
  tap('2026-10-05'); // past, no events -> first listed day
  assert.deepEqual(jumps, ['2026-10-23']); assert.equal(active(), '2026-10-23');
  tap('2026-10-24'); // no events -> next day with events
  assert.equal(jumps.at(-1), '2026-10-25'); assert.equal(active(), '2026-10-25');
  tap('2026-10-25'); // a day with events jumps to itself
  assert.equal(jumps.at(-1), '2026-10-25');
  tap('2026-10-28'); // next event day is in the next month: the calendar follows it and enlarges it
  assert.equal(jumps.at(-1), '2026-11-01'); assert.equal(active(), '2026-11-01');
  assert.ok(grid.children.some(c => c.dataset.date === '2026-11-30'));
  tap('2026-11-15'); // nothing listed after this day: no jump
  assert.equal(jumps.length, 4);
});

test('a click inside a selected range still removes that day instead of jumping', () => {
  const jumps = [], removed = [];
  const parts = { '.calendar-month-label': new El('div'), '.calendar-prev': new El('button'), '.calendar-next': new El('button'), '.calendar-days': new El('div'), '.calendar-sticky': new El('div') };
  const root = new El('div'); root.querySelector = s => parts[s] || null;
  const cal = createStickyCalendar({ root, scrollHost: new El('div'), onJump: d => jumps.push(d), onRemoveDay: d => removed.push(d) });
  cal.set(['2026-10-23', '2026-10-25'], [], [{ start: '2026-10-02', end: '2026-10-08' }]);
  const g = parts['.calendar-days'];
  g.listeners.click({ target: g.children.find(c => c.dataset.date === '2026-10-05'), preventDefault() {} });
  assert.deepEqual(removed, ['2026-10-05']); assert.deepEqual(jumps, []);
});
