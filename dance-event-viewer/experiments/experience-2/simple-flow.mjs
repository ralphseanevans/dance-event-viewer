// Exp2 Simple mode: Where -> Styles -> When (sticky calendar) -> cards, each step
// revealed after the previous one (Exp1 order). Mode choice lives in memory only:
// every load opens Simple. Guiding rule: simple first, complexity added on top.
import { MARKETS } from './markets.mjs?v=aa61ca0a';
import { upcomingIn, availableStyles, groupByDate, flyersFor, timeRange, atMidnight, GROUPS_PER_PAGE } from './simple-core.mjs?v=9e76a810';
import { createFlowLine } from './flow-line.mjs?v=a3dd97bd';
import { createStickyCalendar } from './sticky-calendar.mjs?v=36ada0a8';

const $ = (s, r = document) => r.querySelector(s);
const VIEWER = new URL('../../', import.meta.url);          // /dance-event-viewer/
const SITE = new URL('../../../', import.meta.url);         // site root
const FIELDS = 'key,name,style,type,day_of_week,monthly_rule,exclude_monthly_rules,exclude_dates,start_date,end_date,start_time,end_time,venue,state,cost,source_url,unverified,verified_on,flyer_url';
const CANCEL_FIELDS = 'canceled_dates,cancel_status';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { markets: new Set(), styles: new Set(), soloOpen: false, pages: 1, allDays: [], events: [], logoMap: { logos: {}, patterns: [] }, loaded: false };
const el = {
  find: $('#find'), simple: $('#simple'), full: $('#full'), modes: $('.mode-switch'),
  where: $('#simple-where .place-choices'), styles: $('#simple-styles'), styleChoices: $('#simple-styles .style-choices'),
  results: $('#simple-results'), groups: $('#simple-groups'), more: $('#simple-more'), status: $('#simple-status')
};
const lines = { mode: createFlowLine(el.modes), where: createFlowLine(el.where), styles: createFlowLine(el.styleChoices) };
const calendar = createStickyCalendar({
  root: $('#simple-calendar'), scrollHost: el.results,
  onJump: day => {
    // Every listed day is clickable; reveal more pages if that day is not rendered yet.
    if (!document.getElementById(`simple-date-${day}`)) {
      const i = state.allDays.indexOf(day);
      if (i >= 0) { state.pages = Math.ceil((i + 1) / GROUPS_PER_PAGE); render(); }
    }
    document.getElementById(`simple-date-${day}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }
});

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
  if (state.markets.has(id)) state.markets.delete(id); else state.markets.add(id);
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

function styleButton(style, cls) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.dataset.style = style; b.textContent = style;
  b.setAttribute('aria-pressed', String(state.styles.has(style)));
  return b;
}

function render({ tapped, tappedStyle } = {}) {
  el.where.querySelectorAll('[data-market]').forEach(b => { if (b.dataset.market !== 'other') b.setAttribute('aria-pressed', String(state.markets.has(b.dataset.market))); });
  if (!state.markets.size) {
    state.styles.clear(); state.soloOpen = false;
    el.styles.hidden = true; el.results.hidden = true; el.groups.replaceChildren(); calendar.clear(); lines.styles.hide();
    return;
  }
  if (!state.loaded) { el.status.hidden = false; el.status.textContent = 'Loading dances…'; return; }
  el.status.hidden = true;
  const today = atMidnight(new Date());
  const items = upcomingIn(state.events, [...state.markets], today);
  const { partner, solo } = availableStyles(items);
  [...state.styles].forEach(s => { if (!partner.includes(s) && !solo.includes(s)) state.styles.delete(s); });

  // Styles step
  const wasHidden = el.styles.hidden;
  el.styles.hidden = false;
  if (wasHidden) { el.styles.classList.remove('is-opening'); void el.styles.offsetWidth; el.styles.classList.add('is-opening'); }
  const kids = partner.map(s => styleButton(s, 'style-choice'));
  if (solo.length) {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'style-choice solo-toggle'; t.setAttribute('aria-expanded', String(state.soloOpen));
    t.classList.toggle('has-selection', solo.some(s => state.styles.has(s)));
    t.innerHTML = `${state.soloOpen ? 'Hide' : 'Show'} solo styles (${solo.length}) <span aria-hidden="true">${state.soloOpen ? '−' : '+'}</span>`;
    kids.push(t);
    if (state.soloOpen) solo.forEach(s => kids.push(styleButton(s, 'style-choice solo-choice')));
  }
  if (!partner.length && !solo.length) { const p = document.createElement('p'); p.className = 'simple-empty'; p.textContent = 'No upcoming dances listed here yet. Try another place.'; kids.push(p); }
  el.styleChoices.replaceChildren(...kids, lines.styles.line);
  if (tappedStyle) lines.styles.moveTo(el.styleChoices.querySelector(`[data-style="${CSS.escape(tappedStyle)}"]`));
  else if (tappedStyle === null || !state.styles.size) lines.styles.moveTo(el.styleChoices.querySelector('[aria-pressed="true"]'));
  else lines.styles.refresh();

  // When + cards
  if (!state.styles.size) { el.results.hidden = true; el.groups.replaceChildren(); calendar.clear(); return; }
  const groups = groupByDate(items, [...state.styles]);
  const shown = groups.slice(0, GROUPS_PER_PAGE * state.pages);
  const wasResultsHidden = el.results.hidden;
  el.results.hidden = false;
  if (wasResultsHidden) { el.results.classList.remove('is-revealing'); void el.results.offsetWidth; el.results.classList.add('is-revealing'); }
  if (!shown.length) {
    const p = document.createElement('p'); p.className = 'simple-empty'; p.textContent = 'No upcoming dances for this pick yet.';
    el.groups.replaceChildren(p); calendar.clear(); el.more.hidden = true; return;
  }
  const blocks = shown.map(dateBlock);
  el.groups.replaceChildren(...blocks);
  el.more.hidden = groups.length <= shown.length;
  state.allDays = groups.map(g => g.day);
  calendar.set(state.allDays, blocks);
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
function tile({ ev, canceled }) {
  const a = document.createElement('article');
  a.className = 'event-tile' + (canceled ? ' is-canceled' : '');
  const flyers = flyersFor(ev, state.logoMap).map(resolve);
  const art = document.createElement(flyers.length ? 'button' : 'div');
  art.className = 'flyer-wrap';
  if (flyers.length) {
    art.type = 'button'; art.setAttribute('aria-label', `Enlarge flyer for ${ev.name}${flyers.length > 1 ? ` (${flyers.length} pages)` : ''}`);
    const img = document.createElement('img'); img.src = flyers[0]; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    art.appendChild(img);
    if (flyers.length > 1) { const c = document.createElement('span'); c.className = 'flyer-count'; c.textContent = `1/${flyers.length}`; art.appendChild(c); }
    art.addEventListener('click', () => openLightbox(flyers, ev.name, art));
  } else {
    art.classList.add('no-flyer'); art.textContent = ev.style || 'Dance';
  }
  const body = document.createElement('div'); body.className = 'tile-body';
  if (canceled) { const c = document.createElement('p'); c.className = 'tile-cancel'; c.textContent = 'Canceled this date'; body.appendChild(c); }
  const name = document.createElement('h4'); name.className = 'tile-name'; name.textContent = ev.name;
  const meta = document.createElement('p'); meta.className = 'tile-meta';
  const t = document.createElement('strong'); t.textContent = timeRange(ev); meta.append(t, document.createTextNode([ev.style, ev.cost].filter(Boolean).map(x => ` · ${x}`).join('')));
  const venue = document.createElement('p'); venue.className = 'tile-venue'; venue.textContent = ev.venue || 'Venue not listed';
  const links = document.createElement('p'); links.className = 'tile-links';
  if (ev.venue) { const m = document.createElement('a'); m.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue)}`; m.target = '_blank'; m.rel = 'noopener'; m.innerHTML = 'Directions <span aria-hidden="true">↗</span>'; links.appendChild(m); }
  const src = safeUrl(ev.source_url); if (src) { const o = document.createElement('a'); o.href = src; o.target = '_blank'; o.rel = 'noopener noreferrer'; o.innerHTML = 'Event page <span aria-hidden="true">↗</span>'; links.appendChild(o); }
  body.append(name, meta, venue, links);
  a.append(art, body);
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
