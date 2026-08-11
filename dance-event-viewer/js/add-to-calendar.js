/* Add to Calendar — Dance Event Viewer (2026-08-03)
 *
 * Self-contained module (share-week.js pattern): everything — per-card 📅 button,
 * popover, RRULE/ICS generation, Google Calendar links, and the bulk "Export
 * these (.ics)" control — lives in this one file. app.js contains exactly one
 * hook (in cardActions()): if window.DEV_ADD_TO_CAL exists, its .button(ev) is
 * appended to the card-action row. If this file is missing or fails to load,
 * the site behaves exactly as before.
 *
 * Data rules honored:
 *  - Reads ONLY the whitelisted schedule fields the cards already use
 *    (type, day_of_week, monthly_rule, exclude_monthly_rules, exclude_dates,
 *    start_date, end_date, start_time, end_time, name, venue, cost, source_url,
 *    key). Never invents data: an event whose schedule can't be resolved gets
 *    no calendar entry, with an honest message — never a guessed date.
 *  - No end_time → a 2-hour default duration, and the description says so.
 *
 * Recurrence mapping (RFC 5545):
 *  - weekly_recurring            → FREQ=WEEKLY;BYDAY=xx
 *  - biweekly_recurring          → FREQ=WEEKLY;INTERVAL=2 anchored on the
 *                                  correct-parity occurrence (start_date required,
 *                                  same rule app.js enforces)
 *  - monthly_recurring "Nth Dow" → FREQ=MONTHLY;BYDAY=NthDD (e.g. 2FR)
 *  - monthly_recurring "15th"    → FREQ=MONTHLY;BYMONTHDAY=15
 *  - one_time / tentative        → single VEVENT (timed, or all-day span when
 *                                  the entry has dates but no times)
 *  - exclude_dates               → EXDATE (exact ISO dates from the data)
 *  - exclude_monthly_rules       → enumerated as EXDATEs across the next
 *                                  EXCLUDE_HORIZON_MONTHS months (RRULEs can't
 *                                  express "except Nth weekday" portably)
 *  - end_date                    → UNTIL (end of that local day)
 *
 * All times are written with TZID=America/Chicago and a full VTIMEZONE block so
 * imports land correctly regardless of the importer's home zone. (Every venue in
 * the data is US Central; if that ever changes, add a per-event tz field first.)
 */
(function () {
  "use strict";

  var TZID = "America/Chicago";
  var EXCLUDE_HORIZON_MONTHS = 18;   // how far ahead exclude_monthly_rules become EXDATEs
  var DEFAULT_DURATION_MIN = 120;    // used only when end_time is missing
  var BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  /* Schedule grammar and recurrence math come from js/event-schedule.js, shared with
     app.js. Missing that file leaves the site exactly as it was without this one. */
  var SCHEDULE = window.DEV_SCHEDULE;
  if (!SCHEDULE) return;
  var DAY_ORDER = SCHEDULE.DAY_ORDER;
  var parseISO = SCHEDULE.parseISO;
  var parseHM = SCHEDULE.parseHM;
  var monthlyRuleParts = SCHEDULE.monthlyRuleParts;
  var monthlyDateOfMonth = SCHEDULE.monthlyDateOfMonth;
  var isExcludedOccurrence = SCHEDULE.isExcludedOccurrence;

  /* First occurrence of the SERIES PATTERN on/after today (DTSTART must match the
     RRULE pattern, so — unlike app.js's nextOccurrence — weekly DTSTART does NOT
     skip excluded dates; exclusions are carried as EXDATEs instead). */
  function firstPatternOccurrence(ev, today) {
    var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var start = parseISO(ev.start_date), end = parseISO(ev.end_date);

    if (ev.type === "one_time" || ev.type === "tentative") {
      return start || null;   // past one-times still export fine; UI hides past cards anyway
    }
    if (ev.type === "weekly_recurring") {
      var target = DAY_ORDER.indexOf(ev.day_of_week);
      if (target < 0) return null;
      var d = SCHEDULE.onOrAfterWeekday(t0, target);
      if (start && d < start) d = SCHEDULE.onOrAfterWeekday(start, target);
      if (end && d > end) return null;
      return d;
    }
    if (ev.type === "biweekly_recurring") {
      var tgt = DAY_ORDER.indexOf(ev.day_of_week);
      if (tgt < 0 || !start) return null;
      var b;
      if (t0 <= start) {
        b = new Date(start);
      } else {
        b = SCHEDULE.onOrAfterWeekday(t0, tgt);
        if (!SCHEDULE.onBiweeklyParity(start, b)) b.setDate(b.getDate() + 7);
      }
      if (end && b > end) return null;
      return b;
    }
    if (ev.type === "monthly_recurring") {
      var pattern = SCHEDULE.monthlyPattern(ev.monthly_rule);
      if (!pattern) return null;
      for (var k = 0; k < 3; k++) {
        var month = new Date(t0.getFullYear(), t0.getMonth() + k, 1);
        var m = SCHEDULE.monthlyOccurrence(pattern, month.getFullYear(), month.getMonth());
        if (m && m >= t0 && (!end || m <= end) && (!start || m >= start)) return m;
      }
      return null;
    }
    return null;
  }

  /* Enumerate concrete excluded occurrences (for EXDATE lines) from DTSTART forward. */
  function enumerateExdates(ev, dtstart) {
    var out = [];
    var hasExclusions = (Array.isArray(ev.exclude_dates) && ev.exclude_dates.length) ||
                        (Array.isArray(ev.exclude_monthly_rules) && ev.exclude_monthly_rules.length);
    if (!hasExclusions) return out;
    var end = parseISO(ev.end_date);
    var horizon = new Date(dtstart.getFullYear(), dtstart.getMonth() + EXCLUDE_HORIZON_MONTHS, dtstart.getDate());
    if (end && end < horizon) horizon = end;

    var stepDays = null;
    if (ev.type === "weekly_recurring") stepDays = 7;
    else if (ev.type === "biweekly_recurring") stepDays = 14;

    if (stepDays) {
      for (var d = new Date(dtstart); d <= horizon; d.setDate(d.getDate() + stepDays)) {
        if (isExcludedOccurrence(ev, d)) out.push(new Date(d));
      }
    } else if (ev.type === "monthly_recurring") {
      var pattern = SCHEDULE.monthlyPattern(ev.monthly_rule);
      for (var k = 0; ; k++) {
        var first = new Date(dtstart.getFullYear(), dtstart.getMonth() + k, 1);
        if (first > horizon) break;
        var m = SCHEDULE.monthlyOccurrence(pattern, first.getFullYear(), first.getMonth());
        if (m && m >= dtstart && m <= horizon && isExcludedOccurrence(ev, m)) out.push(m);
      }
    }
    return out;
  }

  /* ---------- RFC 5545 assembly ---------- */

  function pad2(n) { return String(n).padStart(2, "0"); }
  function icsLocal(dt) {   // local wall-clock stamp (used with TZID=)
    return dt.getFullYear() + pad2(dt.getMonth() + 1) + pad2(dt.getDate()) +
      "T" + pad2(dt.getHours()) + pad2(dt.getMinutes()) + pad2(dt.getSeconds());
  }
  function icsDate(dt) {
    return dt.getFullYear() + pad2(dt.getMonth() + 1) + pad2(dt.getDate());
  }
  function icsUtcNow() {
    var d = new Date();
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
      "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }
  /* Local Central wall-clock → UTC "Z" stamp (for RRULE UNTIL, which must be UTC when
     DTSTART carries a TZID). Uses Intl to get the true CST/CDT offset for that date. */
  function centralToUtcStamp(dt) {
    var offMin = centralOffsetMinutes(dt);
    // Rebuild from date components so the result is independent of the viewer's own zone:
    var asUTC = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds());
    var real = new Date(asUTC - offMin * 60000);
    return real.getUTCFullYear() + pad2(real.getUTCMonth() + 1) + pad2(real.getUTCDate()) +
      "T" + pad2(real.getUTCHours()) + pad2(real.getUTCMinutes()) + pad2(real.getUTCSeconds()) + "Z";
  }
  function centralOffsetMinutes(dt) {
    try {
      var f = new Intl.DateTimeFormat("en-US", { timeZone: TZID, timeZoneName: "shortOffset" });
      var part = f.formatToParts(dt).find(function (p) { return p.type === "timeZoneName"; });
      var m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part ? part.value : "");
      if (m) return (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0));
    } catch (e) { /* fall through */ }
    return -300; // sensible fallback: CDT
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }
  function foldLine(line) {   // RFC 5545 §3.1: fold at 75 octets; continuation starts with a space
    var bytes = 0, out = "", cur = "";
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var b = new Blob([ch]).size || 1;
      if (bytes + b > 74) { out += cur + "\r\n "; cur = ch; bytes = 1 + b; }
      else { cur += ch; bytes += b; }
    }
    return out + cur;
  }
  function foldAll(lines) { return lines.map(foldLine).join("\r\n"); }

  var VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:" + TZID,
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0600",
    "TZNAME:CST",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0500",
    "TZNAME:CDT",
    "END:DAYLIGHT",
    "END:VTIMEZONE"
  ];

  function rruleFor(ev) {
    var end = parseISO(ev.end_date);
    var untilPart = "";
    if (end) {
      var eod = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
      untilPart = ";UNTIL=" + centralToUtcStamp(eod);
    }
    if (ev.type === "weekly_recurring") {
      var i = DAY_ORDER.indexOf(ev.day_of_week);
      if (i < 0) return null;
      return "FREQ=WEEKLY;BYDAY=" + BYDAY[i] + untilPart;
    }
    if (ev.type === "biweekly_recurring") {
      var j = DAY_ORDER.indexOf(ev.day_of_week);
      if (j < 0) return null;
      return "FREQ=WEEKLY;INTERVAL=2;BYDAY=" + BYDAY[j] + untilPart;
    }
    if (ev.type === "monthly_recurring") {
      var rule = monthlyRuleParts(ev.monthly_rule);
      if (rule) return "FREQ=MONTHLY;BYDAY=" + rule.nth + BYDAY[rule.dow] + untilPart;
      var dom = monthlyDateOfMonth(ev.monthly_rule);
      if (dom) return "FREQ=MONTHLY;BYMONTHDAY=" + dom + untilPart;
    }
    return null;
  }

  /* Build the VEVENT model for one event, or null (with reason) if unresolvable. */
  function eventModel(ev) {
    var today = new Date();
    var dtstart = firstPatternOccurrence(ev, today);
    if (!dtstart) return { ok: false, reason: "This listing doesn't have a firm date yet, so there's nothing to add to a calendar." };

    var st = parseHM(ev.start_time), et = parseHM(ev.end_time);
    var timed = !!st;
    var startDT, endDT, allDaySpanEnd = null;

    if (timed) {
      startDT = new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate(), st.h, st.m, 0);
      if (et) {
        endDT = new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate(), et.h, et.m, 0);
        if (endDT <= startDT) endDT.setDate(endDT.getDate() + 1);   // past-midnight socials
      } else {
        endDT = new Date(startDT.getTime() + DEFAULT_DURATION_MIN * 60000);
      }
    } else {
      // No start time: all-day. One-time spans cover start_date..end_date inclusive.
      startDT = new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate());
      var spanEnd = (ev.type === "one_time" || ev.type === "tentative") ? (parseISO(ev.end_date) || startDT) : startDT;
      allDaySpanEnd = new Date(spanEnd.getFullYear(), spanEnd.getMonth(), spanEnd.getDate() + 1); // DTEND exclusive
    }

    var rrule = (ev.type === "one_time" || ev.type === "tentative") ? null : rruleFor(ev);
    if (!rrule && ev.type !== "one_time" && ev.type !== "tentative") {
      return { ok: false, reason: "This event's schedule couldn't be turned into a calendar rule." };
    }

    var exdates = rrule ? enumerateExdates(ev, dtstart) : [];

    var descBits = [];
    if (ev.cost) descBits.push("Cost: " + ev.cost);
    if (!et && st) descBits.push("End time not published — a 2-hour block was assumed.");
    if (ev.type === "tentative") descBits.push("Tentative — not yet confirmed.");
    if (Array.isArray(ev.exclude_monthly_rules) && ev.exclude_monthly_rules.length) {
      descBits.push("Does not meet: " + ev.exclude_monthly_rules.join(", ") +
        " (skips through " + (dtstart.getFullYear() + Math.floor((dtstart.getMonth() + EXCLUDE_HORIZON_MONTHS) / 12)) +
        " are marked; re-download later for more).");
    }
    if (ev.source_url && /^https?:\/\//i.test(ev.source_url)) descBits.push("More info: " + ev.source_url);
    descBits.push("From Dance Event Viewer — https://danceeventviewer.net/dance-event-viewer/");

    return {
      ok: true,
      timed: timed,
      startDT: startDT,
      endDT: endDT,
      allDaySpanEnd: allDaySpanEnd,
      rrule: rrule,
      exdates: exdates,
      summary: ev.name || "Dance event",
      location: ev.venue || "",
      description: descBits.join("\n"),
      url: (ev.source_url && /^https?:\/\//i.test(ev.source_url)) ? ev.source_url : null,
      uid: (ev.key || ("dev-" + Math.random().toString(36).slice(2))) + "@danceeventviewer.net",
      tentative: ev.type === "tentative"
    };
  }

  function vevent(model) {
    var L = ["BEGIN:VEVENT",
      "UID:" + esc(model.uid),
      "DTSTAMP:" + icsUtcNow(),
      "SUMMARY:" + esc(model.summary)];
    if (model.timed) {
      L.push("DTSTART;TZID=" + TZID + ":" + icsLocal(model.startDT));
      L.push("DTEND;TZID=" + TZID + ":" + icsLocal(model.endDT));
    } else {
      L.push("DTSTART;VALUE=DATE:" + icsDate(model.startDT));
      L.push("DTEND;VALUE=DATE:" + icsDate(model.allDaySpanEnd));
    }
    if (model.rrule) L.push("RRULE:" + model.rrule);
    model.exdates.forEach(function (d) {
      if (model.timed) {
        var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), model.startDT.getHours(), model.startDT.getMinutes(), 0);
        L.push("EXDATE;TZID=" + TZID + ":" + icsLocal(x));
      } else {
        L.push("EXDATE;VALUE=DATE:" + icsDate(d));
      }
    });
    if (model.location) L.push("LOCATION:" + esc(model.location));
    if (model.description) L.push("DESCRIPTION:" + esc(model.description));
    if (model.url) L.push("URL:" + esc(model.url));
    if (model.tentative) L.push("STATUS:TENTATIVE");
    L.push("END:VEVENT");
    return L;
  }

  function buildICS(models) {
    var lines = ["BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Dance Event Viewer//Add to Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Dance Event Viewer",
      "X-WR-TIMEZONE:" + TZID]
      .concat(VTIMEZONE);
    models.forEach(function (m) { lines = lines.concat(vevent(m)); });
    lines.push("END:VCALENDAR");
    return foldAll(lines) + "\r\n";
  }

  function downloadICS(models, filename) {
    var blob = new Blob([buildICS(models)], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function googleUrl(model) {
    var p = new URLSearchParams();
    p.set("action", "TEMPLATE");
    p.set("text", model.summary);
    if (model.timed) {
      p.set("dates", icsLocal(model.startDT) + "/" + icsLocal(model.endDT));
      p.set("ctz", TZID);
    } else {
      p.set("dates", icsDate(model.startDT) + "/" + icsDate(model.allDaySpanEnd));
    }
    if (model.location) p.set("location", model.location);
    if (model.description) p.set("details", model.description);
    if (model.rrule) p.set("recur", "RRULE:" + model.rrule);
    return "https://calendar.google.com/calendar/render?" + p.toString();
  }

  /* ---------- UI: per-card button + popover ---------- */

  var openPopover = null;
  function closePopover() {
    if (openPopover) { openPopover.remove(); openPopover = null; }
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onDocKey, true);
  }
  function onDocClick(e) {
    if (openPopover && !openPopover.contains(e.target)) closePopover();
  }
  function onDocKey(e) { if (e.key === "Escape") closePopover(); }

  function showPopover(anchor, ev) {
    closePopover();
    var model = eventModel(ev);
    var pop = document.createElement("div");
    pop.className = "atc-popover";
    pop.setAttribute("role", "menu");

    if (!model.ok) {
      var msg = document.createElement("p");
      msg.className = "atc-msg";
      msg.textContent = model.reason;
      pop.appendChild(msg);
    } else {
      var head = document.createElement("div");
      head.className = "atc-head";
      head.textContent = model.rrule ? "Add this repeating dance to your calendar" : "Add this event to your calendar";
      pop.appendChild(head);

      var g = document.createElement("a");
      g.className = "atc-item";
      g.href = googleUrl(model);
      g.target = "_blank";
      g.rel = "noopener";
      g.setAttribute("role", "menuitem");
      g.textContent = "Google Calendar";
      pop.appendChild(g);

      var ics = document.createElement("button");
      ics.type = "button";
      ics.className = "atc-item";
      ics.setAttribute("role", "menuitem");
      ics.textContent = "Apple / Outlook (.ics file)";
      ics.addEventListener("click", function () {
        downloadICS([model], (ev.key || "dance-event") + ".ics");
        closePopover();
      });
      pop.appendChild(ics);

      if (model.rrule) {
        var note = document.createElement("p");
        note.className = "atc-note";
        note.textContent = "Repeats automatically — one add covers every week.";
        pop.appendChild(note);
      }
    }

    // Position: fixed, anchored under the button, clamped to the viewport.
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.right - pw), window.innerWidth - pw - 8);
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    openPopover = pop;
    setTimeout(function () {
      document.addEventListener("click", onDocClick, true);
      document.addEventListener("keydown", onDocKey, true);
    }, 0);
  }

  function makeButton(ev) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-action-btn card-action-calendar";
    btn.setAttribute("aria-label", "Add this event to your calendar");
    btn.title = "Add to calendar";
    btn.textContent = "📅";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (openPopover) { closePopover(); return; }
      showPopover(btn, ev);
    });
    return btn;
  }

  /* ---------- "Share several" bar: add the selected set to a calendar ----------
     Built for app.js's ensureComboUI hook: comboButton(getKeys) returns a bar button
     (id combo-atc-btn so updateComboBar can manage its disabled state). One selected
     dance gets the same Google-or-.ics popover as the card button; two or more get a
     single .ics of the whole set — Google's add-event links only carry one event, so
     the popover says so honestly and .ics (which Google Calendar imports too) is the
     multi path. */
  function comboButton(getKeys) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "combo-atc-btn";
    btn.className = "combo-bar-btn combo-bar-atc";
    btn.textContent = "\uD83D\uDCC5 To my calendar";
    btn.disabled = true;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (openPopover) { closePopover(); return; }
      var keys = (typeof getKeys === "function" ? getKeys() : []) || [];
      var all = (window.DEV_EVENTS_BY_KEY instanceof Map) ? window.DEV_EVENTS_BY_KEY : new Map();
      var evs = keys.map(function (k) { return all.get(k); }).filter(Boolean);
      if (!evs.length) return;
      if (evs.length === 1) { showPopover(btn, evs[0]); return; }

      var models = [], skipped = 0;
      evs.forEach(function (ev) {
        var m = eventModel(ev);
        m.ok ? models.push(m) : skipped++;
      });

      closePopover();
      var pop = document.createElement("div");
      pop.className = "atc-popover";
      pop.setAttribute("role", "menu");

      if (!models.length) {
        var msg = document.createElement("p");
        msg.className = "atc-msg";
        msg.textContent = "None of the selected dances have firm dates yet, so there's nothing to add to a calendar.";
        pop.appendChild(msg);
      } else {
        var head = document.createElement("div");
        head.className = "atc-head";
        head.textContent = "Add all " + models.length + " selected dances";
        pop.appendChild(head);

        var ics = document.createElement("button");
        ics.type = "button";
        ics.className = "atc-item";
        ics.setAttribute("role", "menuitem");
        ics.textContent = "Calendar file (.ics \u2014 " + models.length + " dances)";
        ics.addEventListener("click", function () {
          downloadICS(models, "dance-events-" + models.length + ".ics");
          closePopover();
        });
        pop.appendChild(ics);

        var note = document.createElement("p");
        note.className = "atc-note";
        note.textContent = "Opens in Apple & Outlook; Google Calendar imports it too. " +
          "One-per-link Google adds are only offered for a single dance." +
          (skipped ? " " + skipped + " selected listing" + (skipped === 1 ? " has" : "s have") + " no firm date and " + (skipped === 1 ? "was" : "were") + " left out." : "");
        pop.appendChild(note);
      }

      document.body.appendChild(pop);
      var r = btn.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.min(Math.max(8, r.left + (r.width - pw) / 2), window.innerWidth - pw - 8);
      var top = r.top - ph - 8;                       // bar floats at the bottom → open upward
      if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - ph - 8);
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      openPopover = pop;
      setTimeout(function () {
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("keydown", onDocKey, true);
      }, 0);
    });
    return btn;
  }

  /* ---------- bulk export: "Get .ics of what's on screen" ---------- */

  function visibleEvents() {
    // Read from the live DOM: every rendered card carries data-key, and app.js keeps
    // the master list on window (exposed by the same one-line hook pattern). Fall back
    // to nothing rather than guessing.
    var all = (window.DEV_EVENTS_BY_KEY instanceof Map) ? window.DEV_EVENTS_BY_KEY : null;
    if (!all) return [];
    var keys = Array.prototype.slice.call(document.querySelectorAll(".card[data-key]"))
      .map(function (el) { return el.dataset.key; });
    var seen = {};
    var out = [];
    keys.forEach(function (k) {
      if (seen[k]) return;
      seen[k] = true;
      var ev = all.get(k);
      if (ev) out.push(ev);
    });
    return out;
  }

  function bulkExport() {
    var evs = visibleEvents();
    if (!evs.length) { alert("No events are on screen to export."); return; }
    var models = [];
    var skipped = 0;
    evs.forEach(function (ev) {
      var m = eventModel(ev);
      m.ok ? models.push(m) : skipped++;
    });
    if (!models.length) { alert("None of the events on screen have firm dates to export yet."); return; }
    downloadICS(models, "dance-events.ics");
    if (skipped) {
      // Quiet honesty, no blocking: a transient toast.
      var t = document.createElement("div");
      t.className = "atc-toast";
      t.textContent = skipped + (skipped === 1 ? " listing without a firm date was" : " listings without firm dates were") + " left out.";
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add("show"); }, 20);
      setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 400); }, 4200);
    }
  }

  function ensureBulkButton() {
    if (document.getElementById("atc-bulk-btn")) return;
    // Beside the search box (the view-tabs-row is off-limits: the folder-tab
    // convention forbids extra elements on the tab line). .search-row becomes a
    // flex row via the .atc CSS block so the button sits to the search box's right.
    var host = document.querySelector(".search-row");
    if (!host) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "atc-bulk-btn";
    btn.className = "atc-bulk-btn";
    btn.textContent = "\uD83D\uDCC5 Export these (.ics)";
    btn.title = "Download a calendar file of every event currently shown, filters applied";
    btn.addEventListener("click", bulkExport);
    host.appendChild(btn);
  }

  // Bulk "Export these (.ics)" button disabled for now (2026-08-03, Sean's call).
  // ensureBulkButton()/bulkExport() left intact below — re-enable by restoring the
  // DOMContentLoaded/else block that used to call ensureBulkButton() here.

  window.DEV_ADD_TO_CAL = { button: makeButton, comboButton: comboButton, buildICS: buildICS, _model: eventModel };
})();
