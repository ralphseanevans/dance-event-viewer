// Shared pure schedule helpers for event pages and location/style hubs.
import '../dance-event-viewer/js/cancel-core.js'; // sets globalThis.DEVCancel
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function iso(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Cancel banners: the one shared copy of the rules lives in dance-event-viewer/js/cancel-core.js.
const { DEVCancel } = globalThis;
// A label without its trailing period, for use inside a sentence ("Officially canceled: <date>").
export const cancelLabelText = label => DEVCancel.labelText(label);
// Returns { status, label, whole, note, reason } or null. `day` is an optional YYYY-MM-DD occurrence.
export const cancellationFor = (ev, day) => DEVCancel.cancellationFor(ev, day);

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
const dayOfMonthRule = r => { const m = /^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(String(r || '')); const n = m ? +m[1] : 0; return n >= 1 && n <= 31 ? n : null; };
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
    const r = parseOrdinalRule(ev.monthly_rule), dom = r ? null : dayOfMonthRule(ev.monthly_rule);
    if (!r && !dom) return null;
    for (let i = 0; i < 14; i++) {
      const y = from.getFullYear(), m = from.getMonth() + i;
      // "15th": skip months without that day (no Feb 30th), never invent a nearby date.
      const d = r ? nthWeekdayOfMonth(y, m, r.ord, r.weekday)
        : (dom <= new Date(y, m + 1, 0).getDate() ? new Date(y, m, dom, 12) : null);
      if (d && d >= from && !excluded.has(iso(d))) return ended(d) ? null : iso(d);
    }
    return null;
  }
  // Every other week, anchored on start_date (required, same as the viewer's app.js).
  if (ev.type === 'biweekly_recurring' && ev.day_of_week) {
    const wd = WEEKDAYS.findIndex(w => w.toLowerCase() === String(ev.day_of_week).toLowerCase());
    if (wd < 0 || !ev.start_date) return null;
    const anchor = new Date(ev.start_date + 'T12:00:00');
    anchor.setDate(anchor.getDate() + ((wd - anchor.getDay() + 7) % 7));
    const d = new Date(from < anchor ? anchor : from);
    d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
    if (Math.round((d - anchor) / 864e5) % 14) d.setDate(d.getDate() + 7);
    for (let i = 0; i < 60; i++) {
      if (ended(d)) return null;
      if (!excluded.has(iso(d))) return iso(d);
      d.setDate(d.getDate() + 14);
    }
    return null;
  }
  if (/recurring$/.test(ev.type)) return null; // a recurring rule we can't read: no date, never a stale start_date
  return ev.start_date || null; // one_time / tentative: use the published date even if past
}
export function isPast(ev, today){
  if (ev.type === 'one_time' || ev.type === 'tentative') {
    const lastDay = ev.end_date || ev.start_date;
    return !!lastDay && lastDay < iso(today);
  }
  return /recurring$/.test(ev.type) && !nextOccurrence(ev, today);
}
