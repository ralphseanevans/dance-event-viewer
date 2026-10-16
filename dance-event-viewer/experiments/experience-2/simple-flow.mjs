// Exp2 Simple mode: Where -> Styles -> When (sticky calendar) -> cards, each step
// revealed after the previous one (Exp1 order). Mode choice lives in memory only:
// every load opens Simple. Guiding rule: simple first, complexity added on top.
import { MARKETS } from './markets.mjs?v=aa61ca0a';
import { upcomingIn, availableStyles, groupByDate, flyersFor, timeRange, atMidnight, GROUPS_PER_PAGE } from './simple-core.mjs?v=9e76a810';
import { createFlowLine } from './flow-line.mjs?v=a3dd97bd';
import { createStickyCalendar } from './sticky-calendar.mjs?v=event-date-square-1';

const $ = (s, r = document) => r.querySelector(s);
const VIEWER = new URL('../../', import.meta.url);          // /dance-event-viewer/
const SITE = new URL('../../../', import.meta.url);         // site root
const FIELDS = 'key,name,style,type,day_of_week,monthly_rule,exclude_monthly_rules,exclude_dates,start_date,end_date,start_time,end_time,venue,state,cost,source_url,unverified,verified_on,flyer_url,card_title,instructors,levels,address_line_1,address_line_2,cost_display';
const CANCEL_FIELDS = 'canceled_dates,cancel_status';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const STYLE_BADGES = Object.freeze({
  'Bachata': 'bachata.png',
  'Ballroom': 'ballroom.png',
  'Country Swing': 'country-swing.png',
  'East Coast Swing': 'east-coast-swing.png',
  'Hustle': 'hustle.png',
  'Latin': 'latin.png',
  'Lindy Hop': 'lindy-hop.png'
});

const state = { markets: new Set(), styles: new Set(), dateRanges: [], soloOpen: false, pages: 1, allDays: [], events: [], logoMap: { logos: {}, patterns: [] }, loaded: false };
const el = {
  find: $('#find'), simple: $('#simple'), full: $('#full'), modes: $('.mode-switch'),
  where: $('#simple-where .place-choices'), styles: $('#simple-styles'), styleChoices: $('#simple-styles .style-choices'),
  results: $('#simple-results'), groups: $('#simple-groups'), more: $('#simple-more'), status: $('#simple-status')
};
const lines = { mode: createFlowLine(el.modes), where: createFlowLine(el.where), styles: createFlowLine(el.styleChoices) };
// Draw a separate route from every selected city to the Styles heading.
const routeHost = $('#simple');
routeHost.style.position = 'relative';
const routes = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
routes.classList.add('selection-routes'); routes.setAttribute('aria-hidden', 'true');
routeHost.appendChild(routes);
const routePaths = new Map();
let routeFrame = 0;
function drawCityRoutes() {
  routeFrame = 0;
  const heading = el.styles.querySelector('.style-route-label');
  if (!heading || !heading.getClientRects().length) { routes.replaceChildren(); routePaths.clear(); return; }
  const host = routeHost.getBoundingClientRect();
  // Measure the final letter so the endpoint tracks typography and screen size.
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  let node, last;
  while ((node = walker.nextNode())) if (node.textContent.trim()) last = node;
  let end = heading.getBoundingClientRect();
  if (last) {
    const range = document.createRange();
    const offset = last.textContent.trimEnd().length;
    range.setStart(last, offset - 1); range.setEnd(last, offset);
    end = range.getBoundingClientRect();
  }
  routes.setAttribute('viewBox', `0 0 ${host.width} ${host.height}`);
  const active = new Set();
  el.where.querySelectorAll('[data-market][aria-pressed="true"]').forEach(button => {
    const id = button.dataset.market; active.add(id);
    let path = routePaths.get(id);
    const fresh = !path;
    if (fresh) { path = document.createElementNS(routes.namespaceURI, 'path'); routes.appendChild(path); routePaths.set(id, path); }
    const b = button.getBoundingClientRect();
    const x = b.left + b.width / 2 - host.left, y = b.bottom - host.top + 3;
    const ex = end.left + end.width / 2 - host.left, ey = end.top - host.top - 5;
    const mid = y + Math.max(6, (ey - y) * .5);
    path.setAttribute('d', `M ${x} ${y} V ${mid} H ${ex} V ${ey}`);
    if (fresh && !reduced()) path.animate([{strokeDasharray: '1', strokeDashoffset: 1}, {strokeDasharray: '1', strokeDashoffset: 0}], {duration: 1200, easing: 'ease-in-out', fill: 'both'});
    path.setAttribute('pathLength', '1');
  });
  for (const [id, path] of routePaths) if (!active.has(id)) { path.remove(); routePaths.delete(id); }
}
function scheduleCityRoutes() { if (!routeFrame) routeFrame = requestAnimationFrame(drawCityRoutes); }
new ResizeObserver(scheduleCityRoutes).observe(routeHost);
window.addEventListener('resize', scheduleCityRoutes);
document.fonts?.ready.then(scheduleCityRoutes);
const calendar = createStickyCalendar({
  root: $('#simple-calendar'), scrollHost: el.results,
  onJump: day => {
    // Every listed day is clickable; reveal more pages if that day is not rendered yet.
    if (!document.getElementById(`simple-date-${day}`)) {
      const i = state.allDays.indexOf(day);
      if (i >= 0) { state.pages = Math.ceil((i + 1) / GROUPS_PER_PAGE); render(); }
    }
    if (state.dateRanges.length) { addDateRange({ start: day, end: day }); return; }
    document.getElementById(`simple-date-${day}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  },
  onRemoveDay: day => removeDateDay(day),
  onRange: range => addDateRange(range)
});

const dateRangeForm = $('#calendar-range-form');
dateRangeForm.addEventListener('submit', e => {
  e.preventDefault();
  const start = $('#range-from').value, end = $('#range-to').value;
  if (!start || !end) return;
  addDateRange({ start, end });
});
$('#clear-ranges').addEventListener('click', () => {
  state.dateRanges = []; state.pages = 1;
  $('#calendar-range-status').textContent = 'Date ranges cleared.';
  syncRangeControls(); render();
});
$('#calendar-range-list').addEventListener('click', e => {
  const button = e.target.closest('[data-remove-range]'); if (!button) return;
  state.dateRanges.splice(Number(button.dataset.removeRange), 1); state.pages = 1;
  $('#calendar-range-status').textContent = 'Date range removed.';
  syncRangeControls(); render();
});
function rangeLabel(range) {
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const date = key => fmt.format(new Date(`${key}T12:00:00`));
  return range.start === range.end ? date(range.start) : `${date(range.start)} – ${date(range.end)}`;
}
function syncRangeControls() {
  const summary = $('#calendar-range-summary');
  summary.textContent = state.dateRanges.length ? `Date ranges (${state.dateRanges.length})` : 'Enter date range';
  const list = $('#calendar-range-list');
  list.replaceChildren();
  state.dateRanges.forEach((range, index) => {
    const chip = document.createElement('span'); chip.className = 'range-chip';
    const text = document.createElement('span'); text.textContent = rangeLabel(range);
    const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.removeRange = String(index);
    remove.setAttribute('aria-label', `Remove ${rangeLabel(range)}`); remove.textContent = '×';
    chip.append(text, remove); list.appendChild(chip);
  });
  list.hidden = state.dateRanges.length === 0;
  $('#clear-ranges').disabled = state.dateRanges.length === 0;
}
function removeDateDay(day) {
  const adjacent = delta => {
    const date = new Date(day + 'T12:00:00');
    date.setDate(date.getDate() + delta);
    return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  };
  state.dateRanges = state.dateRanges.flatMap(range => {
    if (day < range.start || day > range.end) return [range];
    const pieces = [];
    if (range.start < day) pieces.push({ start: range.start, end: adjacent(-1) });
    if (day < range.end) pieces.push({ start: adjacent(1), end: range.end });
    return pieces;
  });
  state.pages = 1;
  $('#calendar-range-status').textContent = 'Removed ' + rangeLabel({ start: day, end: day }) + '.';
  syncRangeControls(); render();
}
function addDateRange(range) {
  const start = range.start < range.end ? range.start : range.end;
  const end = range.start < range.end ? range.end : range.start;
  const ordered = [...state.dateRanges, { start, end }].sort((a, b) => a.start.localeCompare(b.start));
  state.dateRanges = ordered.reduce((out, item) => {
    const last = out.at(-1);
    if (last && item.start <= last.end) last.end = item.end > last.end ? item.end : last.end;
    else out.push({ ...item });
    return out;
  }, []);
  state.pages = 1;
  $('#range-from').value = ''; $('#range-to').value = '';
  $('#calendar-range-status').textContent = `Added ${rangeLabel({ start, end })}.`;
  syncRangeControls(); render();
}
syncRangeControls();

// ---------- data: same order as the main viewer's loadData() ----------
async function loadEvents() {
  const cfg = window.DANCE_EVENT_VIEWER_SUPABASE;
  let list = null;
  if (cfg?.enabled && cfg.url && cfg.publishableKey && cfg.table) {
    try {
      const get = f => fetch(`${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?select=${encodeURIComponent(f)}`, { cache: 'no-store', headers: { apikey: cfg.publishableKey } });
      let r = await get(`${FIELDS},${CANCEL_FIELDS}`);
      if (r.status === 400) r = await get(FIELDS);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); if (Array.isArray(j)) list = j;
    } catch (e) { console.warn('Supabase listings unavailable; using static JSON.', e); }
  }
  if (!list) {
    const r = await fetch(new URL('dance_events.json', SITE), { cache: 'no-store' });
    const j = JSON.parse((await r.text()).replace(/\u0000+\s*$/g, '').trim());
    list = Array.isArray(j?.events) ? j.events : [];
  }
  let overlay = [];
  try { const r = await fetch(new URL('web-events.json', SITE), { cache: 'no-store' }); if (r.ok) { const j = await r.json(); overlay = Array.isArray(j?.events) ? j.events : []; } } catch {}
  const keys = new Set(list.map(e => e?.key).filter(Boolean));
  return list.concat(overlay.filter(e => e && !(typeof e.key === 'string' && keys.has(e.key))));
}
async function loadLogoMap() {
  try { const r = await fetch(new URL('logo-map.json', VIEWER)); if (r.ok) return await r.json(); } catch {}
  return { logos: {}, patterns: [] };
}

// ---------- mode switch (memory only) ----------
function setMode(mode, { focusWhere = false } = {}) {
  const simple = mode === 'simple';
  el.simple.hidden = !simple; el.full.hidden = simple;
  el.modes.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  lines.mode.moveTo(el.modes.querySelector(`[data-mode="${mode}"]`));
  if (!simple && focusWhere) {
    const place = $('#place');
    if (place) { place.value = 'all'; place.dispatchEvent(new Event('change')); $('#filters')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); place.focus({ preventScroll: true }); }
  }
  if (simple) {
    // Fresh Simple state on every switch back (no stale styles/cards from before).
    state.markets.clear(); state.styles.clear(); state.soloOpen = false; state.pages = 1; state.allDays = [];
    lines.where.hide?.(); render(); lines.where.refresh(); lines.styles.refresh();
  }
}
el.modes.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });

// ---------- Where ----------
el.where.addEventListener('click', e => {
  const b = e.target.closest('button[data-market]'); if (!b) return;
  if (b.dataset.market === 'other') { setMode('full', { focusWhere: true }); return; }
  const id = b.dataset.market;
  // With no explicit market selection, the default view covers all nearby markets.
  // The first tap narrows to that market; subsequent taps add or remove markets.
  if (!state.markets.size) state.markets.add(id);
  else if (state.markets.has(id)) state.markets.delete(id);
  else state.markets.add(id);
  state.pages = 1;
  // The line follows the latest tapped selection; if that was a deselect, fall back to another pick.
  lines.where.moveTo(state.markets.has(id) ? b : el.where.querySelector('[aria-pressed="true"]:not([data-market="' + id + '"])'));
  render({ tapped: 'where' });
});

// ---------- Styles ----------
el.styleChoices.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('solo-toggle')) { state.soloOpen = !state.soloOpen; render(); return; }
  const s = b.dataset.style; if (!s) return;
  if (state.styles.has(s)) state.styles.delete(s); else state.styles.add(s);
  state.pages = 1;
  render({ tappedStyle: state.styles.has(s) ? s : null });
});

function styleButton(style, cls, available = true) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.dataset.style = style;
  const badgeFile = STYLE_BADGES[style];
  if (badgeFile) {
    b.classList.add('has-style-badge');
    b.setAttribute('aria-label', style);
    const img = document.createElement('img');
    img.src = new URL(`assets/style-badges/${badgeFile}`, import.meta.url).href;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.width = 768;
    img.height = 512;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      b.classList.remove('has-style-badge');
      b.removeAttribute('aria-label');
      img.remove();
      b.textContent = style;
    }, { once: true });
    b.appendChild(img);
  } else {
    b.textContent = style;
  }
  b.setAttribute('aria-pressed', String(state.styles.has(style)));
  if (!available) { b.disabled = true; b.classList.add('is-unavailable'); b.title = 'No upcoming events in the selected places'; }
  return b;
}

function render({ tapped, tappedStyle } = {}) {
  scheduleCityRoutes();
  el.where.querySelectorAll('[data-market]').forEach(b => { if (b.dataset.market !== 'other') b.setAttribute('aria-pressed', String(state.markets.has(b.dataset.market))); });
  if (!state.loaded) { el.status.hidden = false; el.status.textContent = 'Loading dances…'; return; }
  el.status.hidden = true;
  const today = atMidnight(new Date());
  const markets = state.markets.size ? [...state.markets] : MARKETS.map(m => m.id);
  const items = upcomingIn(state.events, markets, today);
  // Keep all nearby styles visible, but disable styles with no events in the selected places.
  const styleMarkets = MARKETS.map(m => m.id);
  const styleCatalog = upcomingIn(state.events, styleMarkets, today);
  const { partner, solo } = availableStyles(styleCatalog);
  const { partner: availablePartner, solo: availableSolo } = availableStyles(items);
  const availableHere = new Set([...availablePartner, ...availableSolo]);
  [...state.styles].forEach(s => { if (!availableHere.has(s)) state.styles.delete(s); });

  // Styles step
  const wasHidden = el.styles.hidden;
  el.styles.hidden = false;
  if (wasHidden) { el.styles.classList.remove('is-opening'); void el.styles.offsetWidth; el.styles.classList.add('is-opening'); }
  const kids = partner.map(s => styleButton(s, 'style-choice', availableHere.has(s)));
  if (solo.length) {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'style-choice solo-toggle'; t.setAttribute('aria-expanded', String(state.soloOpen));
    t.classList.toggle('has-selection', solo.some(s => state.styles.has(s)));
    t.innerHTML = `${state.soloOpen ? 'Hide' : 'Show'} solo styles (${solo.length}) <span aria-hidden="true">${state.soloOpen ? '−' : '+'}</span>`;
    kids.push(t);
    if (state.soloOpen) solo.forEach(s => kids.push(styleButton(s, 'style-choice solo-choice', availableHere.has(s))));
  }
  if (!partner.length && !solo.length) { const p = document.createElement('p'); p.className = 'simple-empty'; p.textContent = 'No upcoming dances listed here yet. Try another place.'; kids.push(p); }
  el.styleChoices.classList.toggle('has-style-badges', kids.some(node => node.classList?.contains('has-style-badge')));
  el.styleChoices.replaceChildren(...kids, lines.styles.line);
  if (tappedStyle) lines.styles.moveTo(el.styleChoices.querySelector(`[data-style="${CSS.escape(tappedStyle)}"]`));
  else if (tappedStyle === null || !state.styles.size) lines.styles.moveTo(el.styleChoices.querySelector('[aria-pressed="true"]'));
  else lines.styles.refresh();

  // Results are always available. Empty style selection means all available styles.
  const visibleStyles = state.styles.size ? [...state.styles] : [...partner, ...solo];
  const allGroups = groupByDate(items, visibleStyles);
  state.allDays = allGroups.map(g => g.day);
  const groups = state.dateRanges.length
    ? allGroups.filter(g => state.dateRanges.some(r => g.day >= r.start && g.day <= r.end))
    : allGroups;
  const shown = groups.slice(0, GROUPS_PER_PAGE * state.pages);
  const wasResultsHidden = el.results.hidden;
  el.results.hidden = false;
  if (wasResultsHidden) { el.results.classList.remove('is-revealing'); void el.results.offsetWidth; el.results.classList.add('is-revealing'); }
  if (!shown.length) {
    const p = document.createElement('p'); p.className = 'simple-empty';
    p.textContent = state.dateRanges.length ? 'No events fall within the selected date ranges.' : 'No upcoming dances for this pick yet.';
    el.groups.replaceChildren(p); calendar.set(state.allDays, [], state.dateRanges); el.more.hidden = true; return;
  }
  const blocks = shown.map(dateBlock);
  el.groups.replaceChildren(...blocks);
  el.more.hidden = groups.length <= shown.length;
  calendar.set(state.allDays, blocks, state.dateRanges);
}
el.more.addEventListener('click', () => { state.pages++; render(); });

const fmtHead = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
function dateBlock(g) {
  const sec = document.createElement('section');
  sec.className = 'date-block'; sec.id = `simple-date-${g.day}`; sec.dataset.date = g.day;
  const h = document.createElement('h3'); h.className = 'date-heading'; h.textContent = fmtHead.format(new Date(`${g.day}T12:00:00`));
  const grid = document.createElement('div'); grid.className = 'day-events';
  g.items.forEach(x => grid.appendChild(tile(x)));
  sec.append(h, grid);
  return sec;
}
const resolve = p => (/^https?:/i.test(p) ? p : new URL(p.replace(/^\.\.\//, ''), /^\.\.\//.test(p) ? SITE : VIEWER).href);
function safeUrl(s) { try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } }
// Trim only nearly uniform neutral outer borders; originals stay in the lightbox.
function trimFlyerBorder(image) {
  if (image.dataset.trimmed || !image.naturalWidth || image.naturalWidth > 3000 || image.naturalHeight > 4000) return;
  image.dataset.trimmed = 'true';
  try {
    const w = image.naturalWidth, h = image.naturalHeight;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const neutral = (x, y, white) => {
      const p = (y * w + x) * 4;
      return pixels[p + 3] > 250 && (white
        ? Math.min(pixels[p], pixels[p+1], pixels[p+2]) >= 248
        : Math.max(pixels[p], pixels[p+1], pixels[p+2]) <= 10);
    };
    const row = (y, white) => { for (let x=0;x<w;x++) if (!neutral(x,y,white)) return false; return true; };
    const col = (x, white) => { for (let y=0;y<h;y++) if (!neutral(x,y,white)) return false; return true; };
    const edge = (size, check, reverse) => {
      const limit = Math.floor(size * .12);
      for (const white of [false, true]) {
        let n=0;
        while (n<=limit && check(reverse ? size-1-n : n, white)) n++;
        // A border that continues beyond the cap may be intentional artwork.
        if (n>2 && n<=limit) return Math.max(0,n-2);
      }
      return 0;
    };
    const left=edge(w,col,false), right=edge(w,col,true), top=edge(h,row,false), bottom=edge(h,row,true);
    if (!(left || right || top || bottom)) return;
    const cropped = document.createElement('canvas'); cropped.width=w-left-right; cropped.height=h-top-bottom;
    cropped.getContext('2d').drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
    image.src=cropped.toDataURL('image/png');
  } catch { /* Cross-origin images without pixel access retain their original preview. */ }
}
function tile({ ev, canceled, day }) {
  const a = document.createElement('article');
  a.className = 'event-tile' + (canceled ? ' is-canceled' : '');
  a.tabIndex = 0;
  a.addEventListener('click', () => calendar.highlightEvent(day));
  a.addEventListener('keydown', e => {
    if (e.target === a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); calendar.highlightEvent(day); }
  });
  const body = document.createElement('div'); body.className = 'tile-body';
  const style = document.createElement('p'); style.className = 'tile-style'; style.textContent = ev.style || 'Dance';
  body.appendChild(style);
  if (canceled) { const c = document.createElement('p'); c.className = 'tile-cancel'; c.textContent = 'Canceled this date'; body.appendChild(c); }
  const name = document.createElement('h4'); name.className = 'tile-name'; name.textContent = ev.card_title || ev.name;
  body.appendChild(name);
  const paths = {
    instructor: '<circle cx="12" cy="7" r="4" fill="currentColor" stroke="none"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z" fill="currentColor" stroke="none"/>',
    level: '<path d="M4 21v-5h4v5Zm6 0V10h4v11Zm6 0V3h4v18Z" fill="currentColor" stroke="none"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    location: '<path fill="currentColor" stroke="none" d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8m0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6"/>',
    ticket: '<path d="m3 13 10-10 3 3a3 3 0 0 0 4 4l1 1-10 10-3-3a3 3 0 0 0-4-4Z"/><path d="m13 7 1 1m2 2 1 1"/>'
  };
  const row = (kind, text) => {
    const p = document.createElement('p'); p.className = 'tile-detail tile-' + kind;
    p.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[kind] + '</svg>';
    const span = document.createElement('span'); span.textContent = text; p.appendChild(span); body.appendChild(p); return span;
  };
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(day + 'T12:00:00'));
  if (Array.isArray(ev.levels) && ev.levels.length) row('level', ev.levels.join(', '));
  if (Array.isArray(ev.instructors) && ev.instructors.length) row('instructor', ev.instructors.join(', '));
  row('calendar', date + ' · ' + timeRange(ev));
  const location = row('location', ev.address_line_1 || ev.venue || 'Venue not listed');
  if (ev.address_line_2) {
    const second = document.createElement('span'); second.className = 'tile-address-line';
    second.textContent = ev.address_line_2; location.appendChild(second);
  }
  row('ticket', ev.cost_display || ev.cost || 'Cover not listed');
  const detail = (label, text) => {
    const details = document.createElement('details'); details.className = 'tile-extra';
    const summary = document.createElement('summary'); summary.textContent = label;
    const p = document.createElement('p'); p.textContent = text;
    details.append(summary, p); body.appendChild(details);
  };
  if (ev.address_line_1 && ev.venue !== [ev.address_line_1, ev.address_line_2].filter(Boolean).join(', ')) detail('Full address', ev.venue);
  if (ev.cost_display && ev.cost_display !== ev.cost) detail('Pricing details', ev.cost);
  const links = document.createElement('p'); links.className = 'tile-links';
  if (ev.venue) { const m = document.createElement('a'); m.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ev.venue); m.target = '_blank'; m.rel = 'noopener'; m.textContent = 'Directions ↗'; links.appendChild(m); }
  const src = safeUrl(ev.source_url); if (src) { const o = document.createElement('a'); o.href = src; o.target = '_blank'; o.rel = 'noopener noreferrer'; o.textContent = 'Event page ↗'; links.appendChild(o); }
  const flyers = flyersFor(ev, state.logoMap).map(resolve);
  if (flyers.length) {
    a.classList.add('has-flyer');
    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'tile-flyer-preview';
    preview.setAttribute('aria-label', 'Enlarge flyer for ' + ev.name);
    const image = document.createElement('img'); image.addEventListener('load', () => trimFlyerBorder(image)); image.src = flyers[0]; image.alt = 'Flyer for ' + ev.name; image.loading = 'lazy'; image.decoding = 'async';
    preview.appendChild(image);
    preview.addEventListener('click', () => openLightbox(flyers, ev.name, preview));
    a.appendChild(preview);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'tile-flyer-tab';
    toggle.textContent = 'Show flyer'; toggle.setAttribute('aria-expanded', 'false');
    const setFlyerOpen = open => {
      a.classList.toggle('flyer-open', open);
      toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? 'Hide flyer' : 'Show flyer';
      preview.inert = !open;
    };
    preview.inert = true;
    toggle.addEventListener('click', () => setFlyerOpen(!a.classList.contains('flyer-open')));
    a.appendChild(toggle);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'tile-flyer-link'; button.textContent = 'View flyer ↗';
    button.setAttribute('aria-label', 'View flyer for ' + ev.name);
    button.addEventListener('click', () => setFlyerOpen(!a.classList.contains('flyer-open')));
  }
  body.appendChild(links); a.appendChild(body);
  return a;
}

// ---------- flyer lightbox (enlarge + multiple pages) ----------
const box = $('#simple-lightbox'); let pages = [], page = 0, opener = null;
function showPage() {
  $('img', box).src = pages[page]; $('img', box).alt = `${box.dataset.name} flyer, page ${page + 1} of ${pages.length}`;
  $('.lb-count', box).textContent = pages.length > 1 ? `${page + 1} / ${pages.length}` : '';
  box.querySelectorAll('.lb-nav').forEach(b => { b.hidden = pages.length < 2; });
}
function openLightbox(list, name, from) { pages = list; page = 0; opener = from; box.dataset.name = name; showPage(); box.showModal(); }
box.addEventListener('click', e => {
  if (e.target.closest('.lb-close') || e.target === box) box.close();
  const n = e.target.closest('.lb-nav'); if (n) { page = (page + Number(n.dataset.step) + pages.length) % pages.length; showPage(); }
});
box.addEventListener('keydown', e => { if (pages.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { page = (page + (e.key === 'ArrowRight' ? 1 : -1) + pages.length) % pages.length; showPage(); } });
box.addEventListener('close', () => opener?.focus());

setMode('simple');
Promise.all([loadEvents(), loadLogoMap()]).then(([events, logoMap]) => {
  state.events = events.filter(e => e && typeof e.name === 'string' && e.name.trim());
  state.logoMap = logoMap || state.logoMap; state.loaded = true; render();
}).catch(() => { state.loaded = true; el.status.hidden = false; el.status.textContent = 'Listings are unavailable right now. Please try again later.'; });
