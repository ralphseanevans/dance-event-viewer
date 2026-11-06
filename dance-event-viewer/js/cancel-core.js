/* Cancel banners: the ONE copy of the rules (2026-10-31).
   Plain script, no import/export, so the same file works three ways:
     - main viewer:   <script defer src="js/cancel-core.js"> before js/app.js
     - browser .mjs:  import '../dance-event-viewer/js/cancel-core.js';  (gulfcoast)
     - node tools:    import '../dance-event-viewer/js/cancel-core.js';  (tools/event_schedule.mjs)
   It sets globalThis.DEVCancel. See docs/cancel-banners.md.

   Accepted canceled_dates entries (all may be mixed in one array):
     "YYYY-MM-DD"                                   -> likely, no note
     { date, cancel_status, reason }                -> current shape (all live rows today)
     { date, status, note, source, labeled_by, labeled_at, owner_auth }  -> future shape
   When both spellings are present the new one (status / note) wins.
   Status: exactly confirmed | likely | owner (case/space-insensitive). Anything else -> likely.
   "owner" is shown only when the data already says owner; it is never inferred or defaulted.
   Precedence: a matching canceled_dates entry for the shown date beats the row-level
   cancel_status; the row-level value (or legacy canceled/cancelled === true) covers every
   other date. If two entries share a date, the last one wins. Never throws. */
(function (g) {
  "use strict";
  var LABELS = Object.freeze({
    confirmed: "CONFIRMED CANCELED",
    likely: "LIKELY CANCELED",
    owner: "Officially canceled.",   // host/owner-authorized only; never a default
  });
  var DEFAULT_STATUS = "likely";
  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function normStatus(s) {
    var k = typeof s === "string" ? s.trim().toLowerCase() : "";
    return has(LABELS, k) ? k : DEFAULT_STATUS;
  }
  function text(v) {
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }
  function pick(o, newKey, oldKey) {
    return o[newKey] !== undefined && o[newKey] !== null ? o[newKey] : o[oldKey];
  }
  /* One entry -> { date, status, note } or null for anything unusable. */
  function normEntry(e) {
    if (typeof e === "string") return ISO.test(e) ? { date: e, status: DEFAULT_STATUS, note: null } : null;
    if (!e || typeof e !== "object" || Array.isArray(e) || typeof e.date !== "string" || !ISO.test(e.date)) return null;
    return { date: e.date, status: normStatus(pick(e, "status", "cancel_status")), note: text(pick(e, "note", "reason")) };
  }
  /* Every usable entry, in order (duplicates kept; callers use the last for a date). */
  function normalizeCanceledDates(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) { var n = normEntry(list[i]); if (n) out.push(n); }
    return out;
  }
  function make(status, whole, note) {
    var s = normStatus(status);
    return { status: s, label: LABELS[s], whole: whole, note: note, reason: note };
  }
  /* The cancellation that applies to `ev` on `day` ("YYYY-MM-DD", optional), or null.
     Returns { status, label, whole, note, reason } — `reason` is an alias of `note`. */
  function cancellationFor(ev, day) {
    if (!ev || typeof ev !== "object") return null;
    if (typeof day === "string" && ISO.test(day) && Array.isArray(ev.canceled_dates)) {
      var hit = null, list = normalizeCanceledDates(ev.canceled_dates);
      for (var i = 0; i < list.length; i++) if (list[i].date === day) hit = list[i];
      if (hit) return make(hit.status, false, hit.note);
    }
    if (typeof ev.cancel_status === "string" && ev.cancel_status.trim()) return make(ev.cancel_status, true, text(ev.cancel_reason));
    if (ev.canceled === true || ev.cancelled === true) return make(null, true, text(ev.cancel_reason));
    return null;
  }
  /* A label without its trailing period ("Officially canceled." -> "Officially canceled"). */
  function labelText(label) {
    return String(label || "").replace(/\.+$/, "");
  }
  g.DEVCancel = Object.freeze({
    LABELS: LABELS, DEFAULT_STATUS: DEFAULT_STATUS,
    normStatus: normStatus, normEntry: normEntry, normalizeCanceledDates: normalizeCanceledDates,
    cancellationFor: cancellationFor, labelText: labelText,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
