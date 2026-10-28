// Pure logic for Exp2 Simple mode: styles, next occurrences, date groups.
// No DOM, no fetch; tested in tools/tests/experience_2_simple.test.mjs.
import { marketOf } from './markets.mjs?v=76ee9962';

export const SOLO_STYLES = Object.freeze(['Ballet', 'Jazz', 'Hip Hop', 'Contemporary', 'Heels', 'Pom', 'Musical Theatre', 'Dance Fit', 'Line Dance', 'Belly Dance']);
export const GROUPS_PER_PAGE = 10;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseISO = s => { const m = typeof s === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export const atMidnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Exp1 styleFacets() presentation mapping (Ballroom variants -> Ballroom; no Ballroom hiding).
export function styleFacets(style) {
  const v = String(style || '').trim();
  if (!v) return [];
  if (/^Ballroom\s*\(\s*Lead\s*\/\s*Follow\s*\)$/i.test(v) || /^Ballroom\s*(?:\/\s*Social|\(\s*Social\s*\)|Social)$/i.test(v)) return ['Ballroom'];
  if (/^Lindy Hop\s*\/\s*Blues$/i.test(v)) return ['Lindy Hop', 'Blues'];
  if (/^Line Dance\s*\/\s*East Coast Swing$/i.test(v)) return ['Line Dance', 'East Coast Swing'];
  if (/^Swing\s*\/\s*Detroit Ballroom$/i.test(v)) return ['Swing'];
  // Generic clean-up so every city shows the same clean names: drop "(…)" qualifiers,
  // split "A / B" combos, and fold Country Western variants into Country.
  const clean = v.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const parts = clean.split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean)
    .map(x => (/^Country(?:\s+Western)?\b/i.test(x) && !/swing/i.test(x) ? 'Country' : /^Ballroom\b/i.test(x) ? 'Ballroom' : x));
  return parts.length ? [...new Set(parts)] : [v];
}
// Facets for one listing: its style tag, plus Bachata when the title names it but the tag is
// broader (e.g. 'Latin' on "Sensual Sundays -- Bachata Class & Social"). Used for both the
// picker options and the filter, so an option only appears when it has events.
export function eventStyles(ev) {
  const s = styleFacets(ev?.style).slice();
  if (!s.includes('Bachata') && /\bbachata\b/i.test(`${ev?.name || ''} ${ev?.card_title || ''}`)) s.push('Bachata');
  return s;
}
// West Coast Swing first, then A–Z; solo styles separate (shown behind the Solo toggle).
export function orderStyles(styles) {
  const uniq = [...new Set(styles)];
  const az = (a, b) => (a === 'West Coast Swing' ? -1 : b === 'West Coast Swing' ? 1 : a.localeCompare(b));
  return { partner: uniq.filter(s => !SOLO_STYLES.includes(s)).sort(az), solo: uniq.filter(s => SOLO_STYLES.includes(s)).sort(az) };
}

function ordinalRule(rule) {
  const m = /(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.exec(String(rule || ''));
  if (!m) return null;
  const n = { '1st': 1, first: 1, '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, '5th': 5, fifth: 5, last: -1 }[m[1].toLowerCase()];
  return { n, dow: DAYS.findIndex(d => d.toLowerCase() === m[2].toLowerCase()) };
}
function nthWeekday(y, mo, n, dow) {
  if (n === -1) { const last = new Date(y, mo + 1, 0); return new Date(y, mo + 1, -((last.getDay() - dow + 7) % 7)); }
  const first = new Date(y, mo, 1); const d = new Date(y, mo, 1 + ((dow - first.getDay() + 7) % 7) + (n - 1) * 7);
  return d.getMonth() === mo ? d : null;
}
const dayOfMonthRule = r => { const m = typeof r === 'string' && /^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(r); const n = m ? +m[1] : 0; return n >= 1 && n <= 31 ? n : null; };
function excluded(ev, d) {
  if (Array.isArray(ev.exclude_dates) && ev.exclude_dates.includes(iso(d))) return true;
  return Array.isArray(ev.exclude_monthly_rules) && ev.exclude_monthly_rules.some(r => { const p = ordinalRule(r); const x = p && nthWeekday(d.getFullYear(), d.getMonth(), p.n, p.dow); return x && iso(x) === iso(d); });
}

// Next occurrence on/after `today` (a local-midnight Date), or null. Ongoing multi-day one-time events return today.
export function nextOccurrence(ev, today) {
  const start = parseISO(ev.start_date), end = parseISO(ev.end_date);
  if (ev.type === 'one_time' || ev.type === 'tentative') {
    if (!start || (end || start) < today) return null;
    return start >= today ? start : new Date(today);
  }
  const from = start && start > today ? start : today;
  const ok = d => !(end && d > end);
  if (ev.type === 'weekly_recurring' || ev.type === 'biweekly_recurring') {
    const dow = DAYS.findIndex(d => d.toLowerCase() === String(ev.day_of_week || '').toLowerCase());
    if (dow < 0) return null;
    const step = ev.type === 'biweekly_recurring' ? 14 : 7;
    let d = new Date(from); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    if (step === 14 && start) { const anchor = new Date(start); anchor.setDate(anchor.getDate() + ((dow - anchor.getDay() + 7) % 7)); const weeks = Math.round((d - anchor) / 864e5 / 7); if (weeks % 2) d.setDate(d.getDate() + 7); }
    for (let i = 0; i < 60; i++) { if (!excluded(ev, d)) return ok(d) ? d : null; d.setDate(d.getDate() + step); }
    return null;
  }
  if (ev.type === 'monthly_recurring') {
    const r = ordinalRule(ev.monthly_rule), dom = r ? null : dayOfMonthRule(ev.monthly_rule);
    if (!r && !dom) return null;
    for (let i = 0; i < 14; i++) {
      const y = from.getFullYear(), mo = from.getMonth() + i;
      const d = r ? nthWeekday(new Date(y, mo, 1).getFullYear(), new Date(y, mo, 1).getMonth(), r.n, r.dow)
        : (dom <= new Date(y, mo + 1, 0).getDate() ? new Date(y, mo, dom) : null);
      if (d && d >= from && !excluded(ev, d)) return ok(d) ? d : null;
    }
  }
  return null;
}

// Same rules as cancellationFor() in js/app.js / tools/event_schedule.mjs (whole-series or this date).
export function isCanceledOn(ev, day) {
  if (typeof ev.cancel_status === 'string' && ev.cancel_status.trim()) return true;
  if (ev.canceled === true || ev.cancelled === true) return true;
  return Array.isArray(ev.canceled_dates) && ev.canceled_dates.some(c => c === day || (c && typeof c === 'object' && c.date === day));
}
const isUnverified = ev => ev.unverified === true || ev.research_confidence === 'low';

// Upcoming, verified records in the selected markets, with their next date.
export function upcomingIn(events, markets, today, through = null) {
  const set = new Set(markets), rows = [];
  for (const ev of events.filter(ev => ev && ev.key && ev.name && !isUnverified(ev) && set.has(marketOf(ev)))) {
    let date = nextOccurrence(ev, today);
    // Materialize a bounded view window, without cloning or changing the series record.
    for (let n = 0; date && n < 3660; n++) {
      if (through && date > through) break;
      rows.push({ ev, date });
      if (!through || !['weekly_recurring', 'biweekly_recurring', 'monthly_recurring'].includes(ev.type)) break;
      const after = new Date(date); after.setDate(after.getDate() + 1);
      date = nextOccurrence(ev, after);
    }
  }
  return rows;
}
export const availableStyles = items => orderStyles(items.flatMap(x => eventStyles(x.ev)));

// Picker choices: every style with events anywhere in the markets, plus every badged style
// (so people can see it is offered sometimes). A choice is active only when the places in
// view have upcoming events in that style; otherwise it shows dimmed and can't be picked.
// Order is stable (West Coast Swing first, then A–Z), so badges don't move as events come and go.
export function styleChoices(catalogItems, hereItems, badgeStyles = []) {
  const here = availableStyles(hereItems);
  const active = new Set([...here.partner, ...here.solo]);
  const all = orderStyles([...catalogItems.flatMap(x => eventStyles(x.ev)), ...badgeStyles]);
  const tag = s => ({ style: s, active: active.has(s) });
  return { partner: all.partner.map(tag), solo: all.solo.map(tag) };
}

// Toggle a style in the selection. Dimmed (inactive) styles never change it.
export function toggleStyle(selected, style, active) {
  const next = new Set(selected);
  if (!active) return next;
  if (next.has(style)) next.delete(style); else next.add(style);
  return next;
}

// Date groups (chronological). Within a day: active before canceled, then time, then name/key.
export function groupByDate(items, styles) {
  const want = new Set(styles);
  const rows = items.filter(x => eventStyles(x.ev).some(s => want.has(s))).map(x => ({ ...x, day: iso(x.date) }));
  rows.forEach(r => { r.canceled = isCanceledOn(r.ev, r.day); });
  rows.sort((a, b) => a.day.localeCompare(b.day) || (a.canceled - b.canceled)
    || String(a.ev.start_time || '99').localeCompare(String(b.ev.start_time || '99'))
    || String(a.ev.name).localeCompare(String(b.ev.name)) || String(a.ev.key).localeCompare(String(b.ev.key)));
  const groups = [];
  for (const r of rows) { const g = groups.at(-1); if (g && g.day === r.day) g.items.push(r); else groups.push({ day: r.day, items: [r] }); }
  return groups;
}

// Flyers: Supabase flyer_url first, then logo-map image(s), deduped (mirrors flyersFor()).
export function flyersFor(ev, logoMap) {
  const out = []; const push = s => { if (typeof s === 'string' && s && !out.includes(s)) out.push(s); };
  const norm = v => (Array.isArray(v) ? v : [v]).filter(s => typeof s === 'string' && s);
  push(ev.flyer_url);
  const exact = norm(logoMap?.logos?.[ev.key]);
  if (exact.length) exact.forEach(push);
  else for (const p of logoMap?.patterns || []) if (p && ev.key?.includes(p.contains)) { const l = norm(p.logo); if (l.length) { l.forEach(push); break; } }
  return out;
}
// One real-flyer rule shared by the orange flip corner and the Flyers only gallery.
export const hasRealFlyer = (ev, logoMap) => flyersFor(ev, logoMap).length > 0;
export function timeRange(ev) {
  const f = v => { if (!/^\d{1,2}:\d{2}/.test(v || '')) return ''; const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const a = f(ev.start_time), b = f(ev.end_time); return a && b ? `${a}–${b}` : a || b || 'Time not listed';
}

// Optional structured schedule: ev.schedule = [{ label: 'Class', time: '18:00' }, ...]
// (strings are used as-is). No such field exists in the event data yet.
const shortTime = v => { if (!/^\d{1,2}:\d{2}/.test(v || '')) return String(v || '').trim(); const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`; };
export function scheduleEntries(ev) {
  if (!Array.isArray(ev?.schedule)) return [];
  return ev.schedule.map(x => typeof x === 'string' ? x.trim() : [x?.label, shortTime(x?.time || x?.start_time)].map(v => String(v || '').trim()).filter(Boolean).join(' '))
    .filter(Boolean);
}

// Card titles never strand one word on the last line, and never split a hyphenated word
// ("Swing- | Outs"). titleParts splits the title, character for character, into the head and the
// last two words (the tail, kept on one line when it fits; see .tile-name-tail). titleRuns splits a
// piece into plain text and letter-hyphen-letter words ({ nobr: true }, put in a .tile-name-nobr span).
// Nothing is inserted or replaced: joining the pieces gives back the exact title, so find-in-page,
// copied text and the heading's accessible name match the event data.
export function titleParts(text) {
  const t = String(text ?? '');
  const m = t.match(/^([\s\S]*?)(\S+\s+\S+\s*)$/);
  return m ? [m[1], m[2]] : [t, ''];
}

export function titleRuns(text) {
  return String(text ?? '').split(/(\S*[\p{L}\p{N}]-[\p{L}\p{N}]\S*)/u).map((t, i) => ({ text: t, nobr: i % 2 === 1 })).filter(r => r.text);
}

// When the last two words (or a hyphenated word) are wider than the card, the title is scaled down
// just enough for that piece to fit on one line, but never below `min` of its size. Returns the scale
// (1 when it already fits), or 0 when even `min` is too wide; then the tail has to wrap (.loose-tail).
export function titleFitScale(width, pieces, min = 0.8) {
  const need = Math.max(0, ...pieces);
  if (!(width > 0) || need <= width) return 1;
  const k = Math.floor((width / need) * 1000) / 1000;
  return k >= min ? k : 0;
}

// Generated stand-in flyer for cards with no real flyer. Off: such cards show only
// their details (no flyer panel, tab or corner). Set to true to bring it back.
export const SHOW_FALLBACK_FLYER = false;

// Fallback flyer content for events without a real flyer. Missing fields are
// dropped (never "undefined"/"not listed" filler); details are short lines.
export function fallbackFlyerData(ev, day) {
  const clean = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const list = v => (Array.isArray(v) ? v.map(clean).filter(Boolean).join(', ') : clean(v));
  const name = clean(ev.card_title) || clean(ev.name) || 'Dance night';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day || '')
    ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(day + 'T12:00:00')) : '';
  const time = timeRange(ev) === 'Time not listed' ? '' : timeRange(ev);
  const place = clean(ev.address_line_1) ? [clean(ev.address_line_1), clean(ev.address_line_2)].filter(Boolean).join(', ') : clean(ev.venue);
  const details = [list(ev.levels), list(ev.instructors) && 'With ' + list(ev.instructors), clean(ev.cost_display) || clean(ev.cost)].filter(Boolean);
  return { kicker: clean(ev.style) || 'Dance', name, date, time, location: place, details };
}

// Pricing on a card collapses behind a "Pricing details" toggle only when that
// actually saves space: the full text must run past PRICE_MAX_LINES lines, and
// the collapsed view (clamped text + the toggle row) must be at least
// PRICE_MIN_SAVED_LINES lines shorter than the full text. Heights are in px,
// measured after render; lineHeight is the price row's line height.
export const PRICE_MAX_LINES = 5;
export const PRICE_MIN_SAVED_LINES = 2;
export function shouldCollapsePricing({ fullHeight, collapsedHeight, toggleHeight, lineHeight }) {
  if (!(lineHeight > 0) || !(fullHeight > 0)) return false;
  const tooLong = fullHeight > PRICE_MAX_LINES * lineHeight + 0.5 * lineHeight;
  const saved = fullHeight - (collapsedHeight + toggleHeight);
  return tooLong && saved >= PRICE_MIN_SAVED_LINES * lineHeight - 1;
}
