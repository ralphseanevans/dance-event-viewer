// Exp2 sticky calendar: an empty date list must redraw the shown month with no marks
// (QA: Hustle -> Flyers only left Oct 26 marked). Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.style = { setProperty() {} }; this.textContent = ''; this.className = ''; this.listeners = {}; }
  get classList() { const el = this; return { toggle(c, on) { const set = new Set(el.className.split(' ').filter(Boolean)); (on ?? !set.has(c)) ? set.add(c) : set.delete(c); el.className = [...set].join(' '); }, contains: c => el.className.split(' ').includes(c) }; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); }
  replaceChildren(...c) { this.children = c; }
  addEventListener(t, f) { this.listeners[t] = f; }
  getBoundingClientRect() { return { height: 100 }; }
  querySelectorAll(sel) { return sel === 'button[data-date]' ? this.children.filter(c => c.tagName === 'button') : []; }
  querySelector() { return null; }
}
globalThis.document = { createElement: t => new El(t), addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.getComputedStyle = () => ({ position: 'relative' });
globalThis.requestAnimationFrame = () => 1;
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };

const { createStickyCalendar } = await import('../../gulfcoast/sticky-calendar.mjs');

function make() {
  const parts = { '.calendar-month-label': new El('div'), '.calendar-prev': new El('button'), '.calendar-next': new El('button'), '.calendar-days': new El('div'), '.calendar-sticky': new El('div') };
  const root = new El('div'); root.querySelector = s => parts[s] || null;
  return { cal: createStickyCalendar({ root, scrollHost: new El('div') }), grid: parts['.calendar-days'], month: parts['.calendar-month-label'] };
}
const marked = grid => grid.children.filter(c => c.tagName === 'button' && c.className.includes('has-events')).map(c => c.dataset.date);

test('empty date list keeps the last month and clears its day marks', () => {
  const { cal, grid, month } = make();
  cal.set(['2026-10-26'], []);
  assert.deepEqual(marked(grid), ['2026-10-26']);
  cal.set([], []); // e.g. Flyers only, or an empty date range
  assert.equal(month.textContent, 'October 2026');
  assert.deepEqual(marked(grid), []);
  assert.equal(grid.children.filter(c => c.tagName === 'button').length, 31);
});
