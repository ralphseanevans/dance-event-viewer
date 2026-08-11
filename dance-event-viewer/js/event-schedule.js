/* Shared schedule parsing and recurrence math — Dance Event Viewer
 *
 * Single home for the schedule grammar the viewer and the calendar export both
 * speak: the whitelisted schedule fields (type, day_of_week, monthly_rule,
 * exclude_monthly_rules, exclude_dates, start_date, end_date, start_time,
 * end_time) and the date math derived from them. app.js and add-to-calendar.js
 * used to carry their own copies of every function here, so a fix to one
 * (a new monthly_rule format, another exclusion kind) silently missed the
 * other. Load this before both of them.
 *
 * Pure functions only: no DOM, no data fetching, no invented dates — anything
 * the fields don't state resolves to null.
 */
(function (global) {
  "use strict";

  var DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var NTH_WORDS = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4 };

  function pad2(n) { return String(n).padStart(2, "0"); }

  /* "YYYY-MM-DD" -> local midnight Date, or null. */
  function parseISO(d) {
    if (typeof d !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
    if (!m) return null;
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(dt) ? null : dt;
  }

  /* "H:MM" (24h) -> { h, m }, or null when absent/out of range. */
  function parseHM(t) {
    if (typeof t !== "string") return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    return (h >= 0 && h < 24 && mi >= 0 && mi < 60) ? { h: h, m: mi } : null;
  }

  function isoDate(dt) {
    return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
  }

  function startOfDay(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); }

  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }

  function dayIndex(name) { return DAY_ORDER.indexOf(name); }

  /* First date on/after `from` that falls on weekday index `target`. */
  function onOrAfterWeekday(from, target) {
    var d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + ((target - d.getDay()) + 7) % 7);
    return d;
  }

  /* Whole 14-day steps from the anchor: same-weekday dates differ by multiples of
     7, so the only parities possible are 0 or 7 mod 14. */
  function onBiweeklyParity(anchor, dt) {
    return ((Math.round((dt - anchor) / 86400000) % 14) + 14) % 14 === 0;
  }

  /* "First Saturday" -> { nth, dow }, or null when the rule isn't that format. */
  function monthlyRuleParts(rule) {
    if (typeof rule !== "string") return null;
    var m = /(first|1st|second|2nd|third|3rd|fourth|4th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.exec(rule);
    if (!m) return null;
    var dow = DAY_ORDER.findIndex(function (d) { return d.toLowerCase() === m[2].toLowerCase(); });
    return { nth: NTH_WORDS[m[1].toLowerCase()], dow: dow };
  }

  /* Monthly-on-a-calendar-date rule ("the 15th of every month") — a SEPARATE
     convention from monthlyRuleParts(), which only understands "Nth Weekday".
     The two formats are distinguishable on sight, so monthly_rule just holds
     whichever one the event actually uses and this is the fallback. */
  function monthlyDateOfMonth(rule) {
    if (typeof rule !== "string") return null;
    var m = /^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(rule);
    if (!m) return null;
    var day = +m[1];
    return (day >= 1 && day <= 31) ? day : null;
  }

  /* Whichever monthly convention an event uses: { rule, dateOfMonth } with at
     most one side set, or null when monthly_rule says nothing usable. */
  function monthlyPattern(rule) {
    var parts = monthlyRuleParts(rule);
    if (parts) return { rule: parts, dateOfMonth: null };
    var dom = monthlyDateOfMonth(rule);
    return dom ? { rule: null, dateOfMonth: dom } : null;
  }

  /* The single date `pattern` lands on in month m0 of year y, or null when that
     month has no such date (e.g. no Feb 30th — never a nearby guess). */
  function monthlyOccurrence(pattern, y, m0) {
    if (!pattern) return null;
    var first = new Date(y, m0, 1);
    if (pattern.rule) {
      var d = new Date(y, m0, 1 + ((pattern.rule.dow - first.getDay()) + 7) % 7 + (pattern.rule.nth - 1) * 7);
      return d.getMonth() === first.getMonth() ? d : null;
    }
    if (pattern.dateOfMonth > daysInMonth(y, m0)) return null;
    return new Date(y, m0, pattern.dateOfMonth);
  }

  /* Dates a series skips: exact one-off cancellations (exclude_dates) plus
     "Nth weekday of the month" exclusions for an otherwise-weekly series
     (exclude_monthly_rules, e.g. "every Friday except the 1st & 3rd"), which
     are modeled in place instead of splitting the event key. */
  function isExcludedOccurrence(ev, dt) {
    var dates = ev && ev.exclude_dates;
    if (Array.isArray(dates) && dates.length && dates.indexOf(isoDate(dt)) !== -1) return true;
    var rules = ev && ev.exclude_monthly_rules;
    if (!Array.isArray(rules) || !rules.length) return false;
    var dow = dt.getDay();
    var nth = Math.floor((dt.getDate() - 1) / 7) + 1;
    return rules.some(function (r) {
      var p = monthlyRuleParts(r);
      return !!(p && p.dow === dow && p.nth === nth);
    });
  }

  /* "1st"/"2nd"/"3rd"/… for displaying a numeric rule. */
  function ordinal(n) {
    var suffixes = ["th", "st", "nd", "rd"];
    var v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  global.DEV_SCHEDULE = {
    DAY_ORDER: DAY_ORDER,
    parseISO: parseISO,
    parseHM: parseHM,
    isoDate: isoDate,
    startOfDay: startOfDay,
    daysInMonth: daysInMonth,
    dayIndex: dayIndex,
    onOrAfterWeekday: onOrAfterWeekday,
    onBiweeklyParity: onBiweeklyParity,
    monthlyRuleParts: monthlyRuleParts,
    monthlyDateOfMonth: monthlyDateOfMonth,
    monthlyPattern: monthlyPattern,
    monthlyOccurrence: monthlyOccurrence,
    isExcludedOccurrence: isExcludedOccurrence,
    ordinal: ordinal
  };
})(window);
