/* Thanksgiving heads-up for occurrences on Thu Nov 26 and Fri Nov 27, 2026.
   Plain script, no import/export, same pattern as js/cancel-core.js:
     - main viewer:  <script defer src="js/thanksgiving-note.js"> before js/app.js
     - browser .mjs: import '../dance-event-viewer/js/thanksgiving-note.js'
     - node tools:   import '../dance-event-viewer/js/thanksgiving-note.js'
   It sets globalThis.DEVThanksgiving.

   The trigger is the occurrence's calendar date only ("YYYY-MM-DD", or a Date
   built in local time, the way nextOccurrence() builds dates). A UTC instant
   string is ignored so `toISOString()` cannot shift the day backward. A
   canceled occurrence (any truthy cancel flag or cancellation object) gets
   no note — the cancellation banner already says the night is off. */
(function (g) {
  "use strict";
  var TEXT = "🦃 Check before going. This class may not be scheduled due to Thanksgiving.";
  var DATES = Object.freeze({ "2026-11-26": 1, "2026-11-27": 1 });
  var ISO = /^\d{4}-\d{2}-\d{2}$/;

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* Calendar day only. Strings must already be YYYY-MM-DD. Dates use local
     year/month/day, never toISOString() / getUTC*. */
  function calendarDay(day) {
    if (typeof day === "string") return ISO.test(day) ? day : "";
    if (day instanceof Date && !isNaN(day.getTime())) {
      return day.getFullYear() + "-" + pad(day.getMonth() + 1) + "-" + pad(day.getDate());
    }
    return "";
  }

  /* The note for this occurrence, or null. `canceled` is the occurrence's
     cancellation (object, true) — anything truthy suppresses the note. */
  function noteFor(day, canceled) {
    if (canceled) return null;
    var key = calendarDay(day);
    return DATES[key] ? TEXT : null;
  }

  g.DEVThanksgiving = Object.freeze({
    TEXT: TEXT,
    DATES: Object.freeze(["2026-11-26", "2026-11-27"]),
    calendarDay: calendarDay,
    noteFor: noteFor,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
