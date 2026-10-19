// Shared pure schedule helpers for event pages and location/style hubs.
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function iso(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Cancel banners: same rules as cancellationFor() in dance-event-viewer/js/app.js.
const CANCEL_BANNER_LABELS = { confirmed: 'CONFIRMED CANCELED', likely: 'LIKELY CANCELED', owner: 'Officially canceled.' };
const normCancelStatus = s => { const k = typeof s === 'string' ? s.trim().toLowerCase() : ''; return CANCEL_BANNER_LABELS[k] ? k : 'likely'; };
// A label without its trailing period, for use inside a sentence ("Officially canceled: <date>").
export const cancelLabelText = label => String(label || '').replace(/\.+$/, '');
// Returns { status, label, whole, reason } or null. `day` is an optional YYYY-MM-DD occurrence.
export function cancellationFor(ev, day){
  if (!ev) return null;
  const make = (status, whole, reason) => { const s = normCancelStatus(status); return { status: s, label: CANCEL_BANNER_LABELS[s], whole, reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null }; };
  if (typeof ev.cancel_status === 'string' && ev.cancel_status.trim()) return make(ev.cancel_status, true, ev.cancel_reason);
  if (ev.canceled === true || ev.cancelled === true) return make(null, true, ev.cancel_reason);
  if (day && Array.isArray(ev.canceled_dates)) for (const c of ev.canceled_dates) {
    if (c === day) return make(null, false);
    if (c && typeof c === 'object' && c.date === day) return make(c.cancel_status, false, c.reason);
  }
  return null;
}

// Ordinal-weekday parsing for monthly rules and weekly exclusions ("3rd Saturday").
function parseOrdinalRule(rule){
  const m = /(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i.exec(String(rule || ''));
  if (!m) return null;
  const ordMap = { '1st':1, first:1, '2nd':2, second:2, '3rd':3, third:3, '4th':4, fourth:4, '5th':5, fifth:5, last:-1 };
  return { ord: ordMap[m[1].toLowerCase()], weekday: WEEKDAYS.findIndex(w => w.toLowerCase() === m[2].toLowerCase()) };
}
function nthWeekdayOfMonth(year, month, ord, weekday){ // month 0-based
  if (ord === -1) {
    const last = new Date(year, month + 1, 0, 12);
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month + 1, 0 - diff, 12);
  }
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  const d = new Date(year, month, 1 + offset + (ord - 1) * 7, 12);
  return d.getMonth() === first.getMonth() ? d : null;
}
function matchesOrdinalRule(date, rule){
  const r = parseOrdinalRule(rule);
  if (!r) return false;
  const n = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), r.ord, r.weekday);
  return !!n && iso(n) === iso(date);
}
// Next occurrence on/after today for JSON-LD startDate. Returns YYYY-MM-DD or null.
export function nextOccurrence(ev, today){
  const excluded = new Set(Array.isArray(ev.exclude_dates) ? ev.exclude_dates : []);
  const ended = d => ev.end_date && iso(d) > ev.end_date;
  const from = ev.start_date && ev.start_date > iso(today) ? new Date(ev.start_date + 'T12:00:00') : today;
  if (ev.type === 'weekly_recurring' && ev.day_of_week) {
    const wd = WEEKDAYS.findIndex(w => w.toLowerCase() === String(ev.day_of_week).toLowerCase());
    if (wd < 0) return null;
    const d = new Date(from);
    d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
    for (let i = 0; i < 8; i++) { // skip excluded dates / excluded ordinal weeks
      const excludedByRule = (ev.exclude_monthly_rules || []).some(r => matchesOrdinalRule(d, r));
      if (!excluded.has(iso(d)) && !excludedByRule) return ended(d) ? null : iso(d);
      d.setDate(d.getDate() + 7);
    }
    return null;
  }
  if (ev.type === 'monthly_recurring' && ev.monthly_rule) {
    const r = parseOrdinalRule(ev.monthly_rule);
    if (!r) return null;
    for (let i = 0; i < 4; i++) {
      const d = nthWeekdayOfMonth(from.getFullYear(), from.getMonth() + i, r.ord, r.weekday);
      if (d && d >= from && !excluded.has(iso(d))) return ended(d) ? null : iso(d);
    }
    return null;
  }
  return ev.start_date || null; // one_time / tentative: use the published date even if past
}
export function isPast(ev, today){
  if (ev.type === 'one_time' || ev.type === 'tentative') {
    const lastDay = ev.end_date || ev.start_date;
    return !!lastDay && lastDay < iso(today);
  }
  return /recurring$/.test(ev.type) && !nextOccurrence(ev, today);
}
