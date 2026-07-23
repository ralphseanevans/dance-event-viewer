/* Dance Event Viewer
 * Data: ../dance_events.json — the ONLY source of truth, fetched fresh on every load.
 * Community-facing: renders ONLY whitelisted fields (name, style, schedule, venue, cost).
 * Internal fields (notes, sources, ids, confirmation dates) are never rendered.
 * All text goes through textContent — no innerHTML with data — so nothing in the
 * JSON can inject markup.
 */
"use strict";

/* ---------- config ---------- */
// Adding a second list later (e.g. WCS-only) = add an entry here; tabs appear automatically.
const SOURCES = [
  { id: "dance", label: "All Dance Events", file: "../dance_events.json" },
];
const CORE_CATEGORIES = ["West Coast Swing", "Mixed", "Latin", "Argentine Tango"];
// Solo Dance Styles (added 2026-07-13, Sean) — Pensacola Coastals Dance Studio's class schedule.
// These render in their own collapsed "Solo Dance Styles" group in the Style filter (see
// #solo-styles-chips in the Filters panel, 2026-07-17 redesign) rather than the main Style row, but they
// still write into the SAME state.filters.cats Set — a class is just a category like any other,
// only the UI grouping differs. Bachata is deliberately NOT here: it's an existing partner-dance
// entry already categorized "Latin" (sensual-sundays-bachata-pensacola-coastals) — leave it alone.
const SOLO_STYLES = ["Ballet", "Jazz", "Hip Hop", "Contemporary", "Heels", "Pom", "Musical Theatre", "Dance Fit"];
const CATEGORY_WHITELIST = [...CORE_CATEGORIES, ...SOLO_STYLES];
// Regional pivot (2026-07-17, Sean — Phase 0 of the Regional Repositioning Plan): the
// default view shows Southern events; everything else (rest of the US + the few
// international entries) sits behind the "Traveling? Show national events" toggle.
// Geography replaced the old per-org gating — the WSDC / USA Dance / Arthur Murray /
// Fred Astaire toggle chips were removed 2026-07-17; an in-region event shows by
// default no matter which source found it. ev.state comes from the published data
// (2-letter US state; null = unknown/international -> treated as non-regional).
const SOUTHEAST = ["FL", "GA", "AL", "MS", "LA", "TN", "SC", "NC"];
function isRegional(ev) { return SOUTHEAST.includes(ev.state); }
/* True when the visitor has explicitly picked a place in the Country/State/Town panel.
   An explicit location choice is a deliberate request to see that place, so it widens the
   scope past the Southeast-only default — otherwise choosing "California" would match the
   filter yet still show nothing (2026-07-23, Sean). */
function locScopeActive() { return !!(state.sel.country || state.sel.state || state.sel.town); }
const OTHER = "Other";
const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PREFS_KEY = "dance-event-viewer-prefs-v4";   // UI prefs only — never event data. (v2: location model changed 2026-07-11; v3: 2026-07-14 default areas set to Pensacola+Mobile — bump retires stale saved prefs so returning visitors pick up the new default once.)
const DEFAULT_AREAS = ["Pensacola area", "Mobile area"];   // 2026-07-20 (Sean): default location scope back to Pensacola + Mobile selected on load (and on "Clear all"). Anywhere/other chips still available to widen. Areas aren't persisted, so every fresh visit starts here.
const LOGO_MAP_FILE = "logo-map.json";          // event key -> image path (optional; page works without it)
const VENUE_COORDS_FILE = "venue-coords.json";  // cached geocoding for the Map view (optional; page works without it)
const MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";  // free, no API key
const MAP_TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const MAP_MARKER_COLORS = {
  "West Coast Swing": "#4cc2ff", "Mixed": "#7fe0a7", "Latin": "#ffc27d",
  "Argentine Tango": "#ff5fa2", "Other": "#9fadc4",
  // Solo Dance Styles (2026-07-13) — see SOLO_STYLES above.
  "Ballet": "#a78bfa", "Jazz": "#fde047", "Hip Hop": "#f87171", "Contemporary": "#2dd4bf",
  "Heels": "#e879f9", "Pom": "#a3e635", "Musical Theatre": "#818cf8", "Dance Fit": "#f59e0b",
};
// Silent-send endpoint for the correction form: Sean's Google Apps Script web app /exec URL.
// While empty, the form falls back to opening Gmail compose. No credentials live in this page.
const SEND_ENDPOINT = "https://script.google.com/macros/s/AKfycbyTcNCMl42HCDosDST23_E2m_9vYLa6tKiCSIH8Y23G4KYrA5iL-efcbMyZVuGwFD3S/exec";
// Same submission-intake Apps Script the "Submit an Event" form posts to (see submit-event.js).
// Used ONLY when a correction includes an uploaded flyer photo — those go through the real
// Submissions pipeline (tagged submission_kind:"correction") instead of the plain-text
// SEND_ENDPOINT above, since Apps Script doorGet/doPost mail relay isn't built for attachments.
const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwtL7anIfkIv7XBkR7AwDKKc13DBPrEghmcEEZiURWR_NLZI3s8CdayU6VQzelK9VMn6w/exec";
const MAX_CORRECTION_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB — matches submit-event.js's MAX_FLYER_BYTES

/* ---------- favorites (added 2026-07-13, Sean: "share and favorite buttons") ----------
   Purely client-side/this-browser — a heart toggle stored in localStorage, keyed by each
   event's stable `key` field. No server, no account, nothing sent anywhere. Events with no
   `key` (shouldn't happen given loadData()'s whitelist, but guarded anyway) can't be
   favorited — there's no stable id to remember them by. */
const FAVORITES_KEY = "dance-event-viewer-favorites-v1";
function loadFavorites() {
  try {
    const arr = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter(v => typeof v === "string") : []);
  } catch (e) { return new Set(); }
}
function saveFavorites(set) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set])); } catch (e) { /* private mode etc. — just won't persist */ }
}
let favorites = loadFavorites();

/* ---------- state ---------- */
const state = {
  sourceId: SOURCES[0].id,
  events: [],            // decorated events, rebuilt from JSON on every load
  view: "timeline",
  search: "",            // free-text search (2026-07-20, Sean) — matches name/venue/city/style,
                         // narrows within the current scope. Stored lowercased. Not persisted, not in URL.
  logos: {},             // from logo-map.json — purely decorative, optional
  logoPatterns: [],      // fallback substring rules so rolled-over series keep their logo
  webEvents: [],         // from web-events.json — optional overlay of trusted flyer auto-publishes,
                         // separate file from dance_events.json so the two writers never clobber each
                         // other. Merged into the main list on load (main list wins on key). Absence
                         // or failure never affects the core events, same as logo-map/venue-coords.
  venueCoords: {},       // from venue-coords.json — exact-match venue -> {lat, lon}, decorative/optional
  cityFallbacks: {},     // from venue-coords.json — city name -> {lat, lon}, used when no exact match exists
  filters: { cats: new Set(), days: new Set(), areas: new Set(DEFAULT_AREAS), kinds: new Set() },
  sel: { country: "", state: "", town: "" },   // "" = Any; derived from venue text only
  filtersOpen: false,    // filter panel starts collapsed — only the view switcher shows until expanded
  showPast: false,       // hidden by default (2026-07-12, Sean) — the "of N" count and Timeline
                          // listings only count/show current events unless this is turned on.
  showNational: false,   // "Traveling? Show national events" (2026-07-17, Phase 0) — out-of-region
                         // events hide until this is on. Deliberately NOT persisted: every visit
                         // starts regional. Reset filters does not touch it (scope, not a filter).
  showUnverified: false, // "Unverified" toggle (2026-07-20, Sean) — events with research_confidence
                         // "low" (unverified research-batch listings) hide until this is on. Not persisted.
                         // Treated as scope (like showNational): "Clear all" does not reset it.
  selectMode: false,     // "Share several" multi-select mode (2026-07-17, Sean: "share multiple
                         // dances at one time... make it look good together"). Not persisted.
  eventKeys: new Set(),  // when a shared-set link (?events=k1|k2) is opened, restrict the view to
                         // exactly those events so the recipient lands on the shared dances.
};
/* Keys of events the visitor has ticked for a combined share (this session only, never stored). */
const shareSelection = new Set();

/* ---------- helpers: normalization (formatting-only, never invents data) ---------- */
function normCategory(style) {
  if (typeof style !== "string" || !style.trim()) return null;      // no category — never invent one
  const s = style.trim().toLowerCase();
  for (const c of CATEGORY_WHITELIST) if (c.toLowerCase() === s) return c;
  if (s === "unspecified") return OTHER;
  return OTHER;                                                     // genuine but unrecognized style
}
/* 2-letter USPS code -> full state name. The published data carries a `state` field on
   every event (FL, AL, KS, AZ, CA, …); the location filter reads it directly. Before
   2026-07-23 the filter only recognized FL/AL from venue TEXT, so every other state fell
   through as "Unlisted" and could never be chosen (Sean: "I can't even choose the states
   that are listed in the JSON"). */
const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico"
};
/* Location for the filter cascade. State comes from the authoritative 2-letter `state`
   field (falling back to a "…, City, ST" tail in the venue when that field is blank);
   town is parsed from that same venue tail; area keeps the local Pensacola/Mobile
   attribution the area chips rely on. Never invents data — anything unknown stays
   "Unlisted". */
function locationOf(ev) {
  const v = typeof ev?.venue === "string" ? ev.venue : "";
  const loc = { area: "Elsewhere / unlisted", country: "Unlisted", state: "Unlisted", town: "Unlisted" };
  // City + state code from the venue's trailing "…, City, ST[ ZIP]".
  const m = v.match(/(?:^|,)\s*([A-Za-z][A-Za-z .'\-]*?),\s*([A-Za-z]{2})\b(?:\s+\d{5})?/);
  const code = (typeof ev?.state === "string" && ev.state.trim()) ? ev.state.trim().toUpperCase()
    : (m ? m[2].toUpperCase() : "");
  if (US_STATES[code]) { loc.state = US_STATES[code]; loc.country = "USA"; }
  if (m && m[1].trim()) loc.town = m[1].trim();
  // Local hubs the area chips depend on (also backfill town when the venue had no parseable tail).
  if (/pensacola/i.test(v)) { loc.area = "Pensacola area"; if (loc.town === "Unlisted") loc.town = "Pensacola"; }
  else if (/mobile/i.test(v)) { loc.area = "Mobile area"; if (loc.town === "Unlisted") loc.town = "Mobile"; }
  return loc;
}
function kindOf(ev) {
  return (ev.type === "weekly_recurring" || ev.type === "monthly_recurring" || ev.type === "biweekly_recurring")
    ? "Recurring" : "One-time";
}
function parseISO(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  return isNaN(dt) ? null : dt;
}
function fmtTime(t) {
  if (typeof t !== "string" || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${ap}`;
}
function timeRange(ev) {
  const a = fmtTime(ev.start_time), b = fmtTime(ev.end_time);
  return a && b ? `${a}–${b}` : a ? a : null;
}
function fmtDate(dt) {
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function monthlyRuleParts(rule) {
  if (typeof rule !== "string") return null;
  const m = /(first|1st|second|2nd|third|3rd|fourth|4th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.exec(rule);
  if (!m) return null;
  const nth = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4 }[m[1].toLowerCase()];
  const dow = DAY_ORDER.findIndex(d => d.toLowerCase() === m[2].toLowerCase());
  return { nth, dow };
}
/* Monthly-on-a-calendar-date rule (added 2026-07-13, Sean: "the 15th of every month") —
   a SEPARATE convention from monthlyRuleParts() above, which only understands "Nth Weekday"
   (e.g. "First Saturday"). This one accepts a bare day-of-month number, optionally with an
   ordinal suffix ("15" or "15th"), and is tried as a fallback wherever monthlyRuleParts()
   returns null for a monthly_recurring event. The two formats are mutually exclusive and
   distinguishable on sight, so no separate schema field was needed — monthly_rule just
   holds whichever format the event actually uses. */
function monthlyDateOfMonth(rule) {
  if (typeof rule !== "string") return null;
  const m = /^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(rule);
  if (!m) return null;
  const day = Number(m[1]);
  return (day >= 1 && day <= 31) ? day : null;
}
/* "1st"/"2nd"/"3rd"/"4th"/... — used to display a numeric monthly_rule in scheduleText(). */
function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}
/* "Nth weekday of the month" exclusions for an otherwise-weekly event (added 2026-07-17,
   Sean: "SSO doesn't have a dance on 3rd Fridays"). ev.exclude_monthly_rules is an array of
   "Nth Weekday" strings — same grammar monthlyRuleParts() already understands (e.g.
   "First Friday", "Third Friday"). A weekly_recurring occurrence landing on one of those
   Nth-weekdays is suppressed, so a series that meets "every Friday except the 1st & 3rd" is
   modeled in place without splitting the key (which would orphan its logo/calendar links). */
function isExcludedOccurrence(ev, dt) {
  // One-off skips (added 2026-07-18, Sean: "remove the Friday the 24th" — the Salsa Lindy
  // Crossover Night takes SSO's Jul 24 slot): ev.exclude_dates is an array of "YYYY-MM-DD"
  // strings naming single dates the series does NOT meet, for date-specific cancellations
  // that aren't a recurring pattern.
  const dates = ev && ev.exclude_dates;
  if (Array.isArray(dates) && dates.length) {
    const iso = dt.getFullYear() + "-" +
      String(dt.getMonth() + 1).padStart(2, "0") + "-" +
      String(dt.getDate()).padStart(2, "0");
    if (dates.includes(iso)) return true;
  }
  const rules = ev && ev.exclude_monthly_rules;
  if (!Array.isArray(rules) || !rules.length) return false;
  const dow = dt.getDay();
  const nth = Math.floor((dt.getDate() - 1) / 7) + 1;
  return rules.some(r => {
    const p = monthlyRuleParts(r);
    return p && p.dow === dow && p.nth === nth;
  });
}
function dayOf(ev) {
  if (DAY_ORDER.includes(ev.day_of_week)) return ev.day_of_week;
  const rule = monthlyRuleParts(ev.monthly_rule);
  if (rule) return DAY_ORDER[rule.dow];
  const dt = parseISO(ev.start_date);
  if (dt) return DAY_ORDER[dt.getDay()];
  return null;
}

/* Next occurrence on/after `today`, or null if the event is over / undeterminable. */
function nextOccurrence(ev, today) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = parseISO(ev.start_date), end = parseISO(ev.end_date);

  if (ev.type === "one_time" || ev.type === "tentative") {
    if (!start) return null;
    const last = end || start;
    if (last < t0) return null;              // fully in the past
    return start >= t0 ? start : t0;         // upcoming, or ongoing today
  }
  if (ev.type === "weekly_recurring") {
    const target = DAY_ORDER.indexOf(ev.day_of_week);
    if (target < 0) return null;
    let d = new Date(t0);
    d.setDate(d.getDate() + ((target - d.getDay()) + 7) % 7);
    if (start && d < start) {
      d = new Date(start);
      d.setDate(d.getDate() + ((target - d.getDay()) + 7) % 7);
    }
    // Skip Nth-weekday exclusions (e.g. SSO doesn't meet the 1st/3rd Friday) — jump a week at a time.
    for (let guard = 0; guard < 60 && isExcludedOccurrence(ev, d); guard++) {
      d.setDate(d.getDate() + 7);
      if (end && d > end) return null;
    }
    if (end && d > end) return null;
    return d;
  }
  if (ev.type === "monthly_recurring") {
    const rule = monthlyRuleParts(ev.monthly_rule);
    const dateOfMonth = rule ? null : monthlyDateOfMonth(ev.monthly_rule);
    if (!rule && !dateOfMonth) return null;
    for (let k = 0; k < 3; k++) {
      const first = new Date(t0.getFullYear(), t0.getMonth() + k, 1);
      let d;
      if (rule) {
        d = new Date(first);
        d.setDate(1 + ((rule.dow - first.getDay()) + 7) % 7 + (rule.nth - 1) * 7);
      } else {
        if (dateOfMonth > daysInMonth(first.getFullYear(), first.getMonth())) continue;   // e.g. no Feb 30th — skip, never invent a nearby date
        d = new Date(first.getFullYear(), first.getMonth(), dateOfMonth);
      }
      if (d >= t0 && (!end || d <= end) && (!start || d >= start)) return d;
    }
    return null;
  }
  /* Every-other-week on a fixed day (added 2026-07-13, Sean) — meaningless without an anchor
     occurrence, so start_date is REQUIRED here (unlike weekly_recurring, where it's only an
     optional lower bound). Parity is determined by whole 14-day steps from that anchor. */
  if (ev.type === "biweekly_recurring") {
    const target = DAY_ORDER.indexOf(ev.day_of_week);
    if (target < 0 || !start) return null;
    let d;
    if (t0 <= start) {
      d = new Date(start);
    } else {
      d = new Date(t0);
      d.setDate(d.getDate() + ((target - d.getDay()) + 7) % 7);
      const diffDays = Math.round((d - start) / 86400000);
      const rem = ((diffDays % 14) + 14) % 14;
      if (rem !== 0) d.setDate(d.getDate() + 7);   // same-weekday dates differ by multiples of 7, so the
    }                                               // only two parities possible here are 0 or 7 mod 14
    if (end && d > end) return null;
    return d;
  }
  return null;
}

function scheduleText(ev) {
  const tr = timeRange(ev);
  if (ev.type === "weekly_recurring" && ev.day_of_week) {
    let s = `Every ${ev.day_of_week}`;
    if (Array.isArray(ev.exclude_monthly_rules) && ev.exclude_monthly_rules.length) {
      const nths = ev.exclude_monthly_rules
        .map(r => { const p = monthlyRuleParts(r); return p ? ordinal(p.nth) : null; })
        .filter(Boolean);
      if (nths.length) s += ` (except the ${nths.join(" & ")} ${ev.day_of_week})`;
    }
    const start = parseISO(ev.start_date), end = parseISO(ev.end_date);
    if (start && end) s += ` (${fmtDate(start)} – ${fmtDate(end)})`;
    else if (end) s += ` (through ${fmtDate(end)})`;
    return tr ? `${s} · ${tr}` : s;
  }
  if (ev.type === "monthly_recurring" && typeof ev.monthly_rule === "string") {
    const dateOfMonth = monthlyRuleParts(ev.monthly_rule) ? null : monthlyDateOfMonth(ev.monthly_rule);
    const rule = dateOfMonth
      ? `${ordinal(dateOfMonth)} of every month`
      : ev.monthly_rule.split("(")[0].trim();   // keep the public part of the rule text
    return tr ? `${rule} · ${tr}` : rule;
  }
  if (ev.type === "biweekly_recurring" && ev.day_of_week) {
    let s = `Every other ${ev.day_of_week}`;
    const end = parseISO(ev.end_date);
    if (end) s += ` (through ${fmtDate(end)})`;
    return tr ? `${s} · ${tr}` : s;
  }
  const start = parseISO(ev.start_date), end = parseISO(ev.end_date);
  if (start) {
    const ds = end && end.getTime() !== start.getTime() ? `${fmtDate(start)} – ${fmtDate(end)}` : fmtDate(start);
    return tr ? `${ds} · ${tr}` : ds;
  }
  return tr; // may be null — caller omits the line entirely
}

/* An event with a determinable date whose last occurrence is before today. Recurring
   series with no end_date are never "past" (they're ongoing indefinitely); events with
   no date info at all aren't "past" either — they're undetermined (existing behavior:
   hidden from Timeline, shown under Calendar's "Date not yet announced"). */
function isPastEvent(d, today) {
  if (nextOccurrence(d.ev, today)) return false;
  return hasDate(d);
}
/* The date to display on a past event's card — its last known occurrence. */
function pastOccurrenceDate(ev) {
  if (ev.type === "one_time" || ev.type === "tentative") {
    return parseISO(ev.end_date) || parseISO(ev.start_date);
  }
  if (ev.type === "weekly_recurring" || ev.type === "monthly_recurring" || ev.type === "biweekly_recurring") {
    return parseISO(ev.end_date);   // only reached when isPastEvent found an elapsed end_date
  }
  return null;
}

/* ---------- data loading ---------- */
async function loadLogoMap() {
  // Optional decoration: failure or absence of the map never affects event data.
  try {
    const res = await fetch(`${LOGO_MAP_FILE}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = JSON.parse(await res.text());
    if (j && typeof j.logos === "object" && j.logos !== null && !Array.isArray(j.logos)) state.logos = j.logos;
    state.logoPatterns = Array.isArray(j?.patterns)
      ? j.patterns.filter(p => p && typeof p.contains === "string" && p.contains && typeof p.logo === "string" && p.logo)
      : [];
  } catch (err) { state.logos = {}; state.logoPatterns = []; }
}
/* Optional overlay of trusted flyer auto-publishes (../web-events.json, written
   by the submission backend). Same defensive contract as loadLogoMap: any
   failure or absence leaves state.webEvents = [] and the core list is unaffected.
   Kept a SEPARATE file from dance_events.json on purpose — the skills' publish
   pipeline owns dance_events.json and never touches this, so neither writer can
   clobber the other. */
async function loadWebEvents() {
  try {
    const res = await fetch(`../web-events.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) { state.webEvents = []; return; }
    const j = JSON.parse((await res.text()).replace(/ +\s*$/g, "").trim());
    state.webEvents = Array.isArray(j?.events) ? j.events : [];
  } catch (err) { state.webEvents = []; }
}
function logoFor(key) {
  if (typeof key !== "string" || !key) return null;
  const exact = state.logos[key];
  if (typeof exact === "string" && exact) return exact;
  for (const p of state.logoPatterns) if (key.includes(p.contains)) return p.logo;
  return null;
}

/* ---------- Map view helpers (added 2026-07-12) ---------- */
async function loadVenueCoords() {
  // Optional decoration: failure or absence never affects event data or other views.
  try {
    const res = await fetch(`${VENUE_COORDS_FILE}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = JSON.parse(await res.text());
    if (j && typeof j.venues === "object" && j.venues !== null) state.venueCoords = j.venues;
    if (j && typeof j.city_fallbacks === "object" && j.city_fallbacks !== null) state.cityFallbacks = j.city_fallbacks;
  } catch (err) { state.venueCoords = {}; state.cityFallbacks = {}; }
}
/* Tiny deterministic offset so events that share one fallback pin (e.g. several
   "Pensacola, FL" venues) fan out instead of stacking exactly on top of each other.
   Never applied to precise, cache-file coordinates — only to shared fallback pins. */
function jitterFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = (h % 1000) / 1000 - 0.5;
  const b = ((h >> 10) % 1000) / 1000 - 0.5;
  return { dLat: a * 0.02, dLon: b * 0.02 };
}
/* Resolve map coordinates for an event: exact venue-string match first (from
   venue-coords.json), then a city-level fallback derived the same way the
   Location filter already derives area/town — never guessed beyond that. */
function coordsFor(d) {
  const venue = typeof d.ev.venue === "string" ? d.ev.venue : "";
  const exact = state.venueCoords[venue];
  if (exact && typeof exact.lat === "number" && typeof exact.lon === "number") {
    return { lat: exact.lat, lon: exact.lon, precision: exact.precision || "exact" };
  }
  const town = d.loc.town && d.loc.town !== "Unlisted" ? d.loc.town : null;
  const fallback = town && state.cityFallbacks[town];
  if (fallback) {
    const j = jitterFor(d.ev.key || d.ev.name || venue);
    return { lat: fallback.lat + j.dLat, lon: fallback.lon + j.dLon, precision: "city" };
  }
  return null; // genuinely unlisted/elsewhere — never invented
}

async function loadData() {
  const src = SOURCES.find(s => s.id === state.sourceId);
  setStatus("Loading events…", false);
  await loadLogoMap();
  await loadVenueCoords();
  await loadWebEvents();
  let raw;
  try {
    const res = await fetch(`${src.file}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.text();
  } catch (err) {
    state.events = [];
    render();
    setStatus("Couldn’t load the events file. If you opened this page as a plain file, run the local server (see README).", true);
    return;
  }
  let data;
  try {
    // Tolerate a torn-write tail (trailing NULs/garbage after the JSON document).
    data = JSON.parse(raw.replace(/\u0000+\s*$/g, "").trim());
  } catch (err) {
    state.events = [];
    render();
    setStatus("The events file couldn’t be read (invalid data). Nothing is displayed rather than showing wrong information.", true);
    return;
  }
  const list = Array.isArray(data?.events) ? data.events : null;
  if (!list) {
    state.events = [];
    render();
    setStatus("The events file has an unexpected format. Nothing is displayed rather than showing wrong information.", true);
    return;
  }
  // Overlay merge: fold in trusted flyer auto-publishes from web-events.json.
  // The canonical list wins on key, so once a skill folds an overlay event into
  // dance_events.json (same key), the core copy silently supersedes the overlay
  // one instead of double-listing. Keyless overlay entries (shouldn't happen —
  // the backend always assigns a key) are kept as-is.
  const coreKeys = new Set(list.map(ev => ev && ev.key).filter(Boolean));
  const overlayOnly = (state.webEvents || []).filter(
    ev => ev && !(typeof ev.key === "string" && coreKeys.has(ev.key))
  );
  const merged = overlayOnly.length ? list.concat(overlayOnly) : list;
  state.events = merged
    .filter(ev => ev && typeof ev.name === "string" && ev.name.trim())
    .map(ev => ({
      ev,
      category: normCategory(ev.style),
      loc: locationOf(ev),
      kind: kindOf(ev),
      day: dayOf(ev),
    }));
  buildFilterChips();
  render();
}

/* ---------- filters ---------- */
function presentValues(fn, order) {
  const vals = new Set(state.events.map(fn).filter(Boolean));
  return order ? order.filter(v => vals.has(v)) : [...vals].sort();
}
// Activity Pulse: a snapshot of every currently-active filter dimension, used to compose
// combined ticker sentences ("A dancer is interested in west coast swing dances on
// Thursday.") instead of one generic line per click (Sean, 2026-07-13: "you can make the
// sentences more interesting if there is more filters selected"). Only the first selected
// value per dimension is included — matches the existing single-value area-attribution
// pattern already used here, since these Sets can hold more than one value.
// Sean, 2026-07-13: "WSDC USA Dance arthur Murray and Fed Astarire are all treated as
// styles. they can be used for this purpose too" — as of the 2026-07-13 filter-bug fix, the
// four national-source tags are plain members of state.filters.cats (same as any style), so
// they're already covered by the cats read below with no separate fallback needed.
function filterSnapshotDetail() {
  return {
    type: "filter",
    cats: [...state.filters.cats][0] || null,
    days: [...state.filters.days][0] || null,
    areas: [...state.filters.areas][0] || null,
    kinds: [...state.filters.kinds][0] || null,
  };
}
/* ---------- Filter UI (redesigned 2026-07-17 per Sean's spec) ----------
   Always-visible "Dance style" + "Day" pill rows; Location / Event type / Solo styles /
   Country-State-Town live in the collapsible panel. Facet counts on every option, dimmed
   (never hidden) at zero. Event type is SINGLE-select (radio-style); style/day/location are
   multi-select (checkbox-style). Active filters echo as removable summary chips while the
   panel is closed, and the whole filter state round-trips through the URL query string. */
const AREA_LABELS = { "Pensacola area": "Pensacola", "Mobile area": "Mobile", "Elsewhere / unlisted": "Elsewhere" };
const SINGLE_SELECT_GROUPS = ["kinds"];
function chipLabel(group, v) { return group === "areas" ? (AREA_LABELS[v] || v) : v; }

function makeChip(label, onClick, single) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip" + (single ? " chip-radio" : "");
  b.setAttribute("aria-pressed", "false");
  const t = document.createElement("span"); t.className = "chip-label"; t.textContent = label; b.appendChild(t);
  const c = document.createElement("span"); c.className = "chip-count"; b.appendChild(c);
  b.addEventListener("click", onClick);
  return b;
}
function toggleValue(group, v) {
  const set = state.filters[group];
  const wasSelected = set.has(v);
  if (SINGLE_SELECT_GROUPS.includes(group)) { set.clear(); if (!wasSelected) set.add(v); }
  else { wasSelected ? set.delete(v) : set.add(v); }
  render();
  if (!wasSelected) window.dispatchEvent(new CustomEvent("activity-signal", { detail: filterSnapshotDetail() }));
}
function buildFilterChips() {
  const groups = {
    cats:  { holder: document.getElementById("main-style-chips"), values: presentValues(d => d.category, [...CORE_CATEGORIES, OTHER]), all: "All styles" },
    days:  { holder: document.querySelector('.chips[data-group="days"]'), values: presentValues(d => d.day, DAY_ORDER), all: "Any day" },
    areas: { holder: document.querySelector('.chips[data-group="areas"]'), values: presentValues(d => d.loc.area, ["Pensacola area", "Mobile area"]), all: "Anywhere" },   // "Elsewhere / unlisted" chip removed 2026-07-20 (Sean); those events still show under "Anywhere"
    kinds: { holder: document.querySelector('.chips[data-group="kinds"]'), values: presentValues(d => d.kind, ["Recurring", "One-time"]), all: "All types" },
  };
  buildLocSelects();
  for (const [group, cfg] of Object.entries(groups)) {
    if (!cfg.holder) continue;
    cfg.holder.textContent = "";
    const single = SINGLE_SELECT_GROUPS.includes(group);
    const all = makeChip(cfg.all, () => { state.filters[group].clear(); render(); }, single);
    all.dataset.all = "1";
    cfg.holder.appendChild(all);
    for (const v of cfg.values) {
      const chip = makeChip(chipLabel(group, v), () => toggleValue(group, v), single);
      chip.dataset.value = v;
      cfg.holder.appendChild(chip);
    }
  }
  const solo = document.getElementById("solo-styles-chips");
  if (solo) {
    solo.textContent = "";
    for (const v of presentValues(d => d.category, SOLO_STYLES)) {
      const chip = makeChip(v, () => toggleValue("cats", v), false);
      chip.dataset.value = v;
      solo.appendChild(chip);
    }
    solo.closest(".filter-group").hidden = !solo.children.length;
  }
  updateFilterUI();
}
/* Facet count: events that would show if `value` were the ONLY selection in its group,
   with every other group's current filters (and the regional/past scopes) applied.
   value === null -> the group unfiltered. */
function facetCount(group, value) {
  const saved = state.filters[group];
  state.filters[group] = value === null ? new Set() : new Set([value]);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let n = 0;
  for (const d of state.events) if (matchesFilters(d) && (state.showPast || !isPastEvent(d, t))) n++;
  state.filters[group] = saved;
  return n;
}
function activeFilterList() {
  const out = [];
  for (const [group, set] of Object.entries(state.filters))
    for (const v of set) out.push({ group, v, label: chipLabel(group, v) });
  for (const dim of ["country", "state", "town"])
    if (state.sel[dim]) out.push({ group: "sel", v: dim, label: state.sel[dim] });
  return out;
}
function updateFilterUI() {
  for (const holder of document.querySelectorAll(".chips[data-group]")) {
    const group = holder.dataset.group;
    const set = state.filters[group];
    if (!set) continue;
    for (const chip of holder.querySelectorAll(".chip")) {
      const on = chip.dataset.all ? set.size === 0 : set.has(chip.dataset.value);
      chip.setAttribute("aria-pressed", String(on));
      const cEl = chip.querySelector(".chip-count");
      // "Anywhere" (areas all-option) shows the unfiltered location count (2026-07-20, Sean);
      // other groups' all-options stay countless.
      if (chip.dataset.all) { if (cEl) cEl.textContent = group === "areas" ? ` (${facetCount(group, null)})` : ""; continue; }
      const n = facetCount(group, chip.dataset.value);
      if (cEl) cEl.textContent = ` (${n})`;
      chip.classList.toggle("chip-dim", n === 0 && !on);
    }
  }
  const act = activeFilterList();
  const toggleCount = document.getElementById("filters-count");
  const panelCount = document.getElementById("filters-count-panel");
  if (toggleCount) toggleCount.textContent = act.length ? `${act.length} active` : "";
  if (panelCount) panelCount.textContent = act.length ? `(${act.length})` : "";
  renderActiveChips(act);
  syncUrl();
  savePrefs();
}
function renderActiveChips(act) {
  const row = document.getElementById("active-chips");
  if (!row) return;
  act = act || activeFilterList();
  row.textContent = "";
  if (state.view === "timeline" || state.filtersOpen || !act.length) { row.hidden = true; return; }
  row.hidden = false;
  for (const a of act) {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "active-chip";
    chip.setAttribute("aria-label", `Remove filter ${a.label}`);
    chip.append(a.label + " ");
    const x = document.createElement("span"); x.className = "active-chip-x"; x.setAttribute("aria-hidden", "true"); x.textContent = "\u00d7";
    chip.appendChild(x);
    chip.addEventListener("click", () => {
      if (a.group === "sel") {
        state.sel[a.v] = "";
        if (a.v === "country") { state.sel.state = ""; state.sel.town = ""; }
        if (a.v === "state") state.sel.town = "";
        buildLocSelects();
      } else state.filters[a.group].delete(a.v);
      render();
    });
    row.appendChild(chip);
  }
  const clear = document.createElement("button");
  clear.type = "button"; clear.className = "active-clear"; clear.textContent = "Clear all";
  clear.addEventListener("click", clearAllFilters);
  row.appendChild(clear);
}
function clearAllFilters() {
  for (const set of Object.values(state.filters)) set.clear();
  state.filters.areas = new Set(DEFAULT_AREAS);
  state.sel = { country: "", state: "", town: "" };
  state.search = "";
  syncSearchInput();
  buildLocSelects();
  render();
}
/* Keep the search box + its clear button in sync with state.search (called on clear-all
   and whenever search changes programmatically). */
function syncSearchInput() {
  const input = document.getElementById("event-search");
  if (input && input.value !== state.search) input.value = state.search;
  const clearBtn = document.getElementById("event-search-clear");
  if (clearBtn) clearBtn.hidden = !state.search;
}
/* ---------- URL state (2026-07-17): active filters live in the query string, so filtered
   views are shareable links and back/forward work. localStorage keeps only view/showPast. */
const URL_KEYS = { cats: "style", days: "day", areas: "area", kinds: "type" };
function syncUrl() {
  const p = new URLSearchParams();
  for (const [group, key] of Object.entries(URL_KEYS))
    if (state.filters[group].size) p.set(key, [...state.filters[group]].join("|"));
  for (const dim of ["country", "state", "town"]) if (state.sel[dim]) p.set(dim, state.sel[dim]);
  if (state.showPast) p.set("past", "1");
  if (state.showNational) p.set("travel", "1");
  if (state.showUnverified) p.set("unverified", "1");
  if (state.eventKeys.size) p.set("events", [...state.eventKeys].join("|"));   // shared-set landing link
  const qs = p.toString().replace(/%7C/gi, "|").replace(/%20/g, "+");
  const url = location.pathname + (qs ? "?" + qs : "");
  if (url !== location.pathname + location.search) history.replaceState(null, "", url);
}
function applyUrl() {
  const p = new URLSearchParams(location.search);
  let any = false;
  for (const [group, key] of Object.entries(URL_KEYS)) {
    if (!p.has(key)) continue;
    any = true;
    state.filters[group] = new Set(p.get(key).split("|").filter(Boolean));
  }
  for (const dim of ["country", "state", "town"])
    if (p.has(dim)) { state.sel[dim] = p.get(dim); any = true; }
  if (p.get("past") === "1") { state.showPast = true; any = true; }
  state.showNational = p.get("travel") === "1";
  state.showUnverified = p.get("unverified") === "1";
  // Shared-set link: show exactly the listed events, regardless of region/past, so the
  // recipient always sees the dances that were shared with them (2026-07-17).
  if (p.has("events")) {
    state.eventKeys = new Set(p.get("events").split("|").filter(Boolean));
    if (state.eventKeys.size) { state.showPast = true; state.showNational = true; any = true; }
  } else {
    state.eventKeys = new Set();
  }
  return any;
}
/* Country -> State -> Town cascade: each level's options come from events matching the
   dimensions above it; only rendered controls participate in the visible cascade, so
   State can stand alone while Town stays disabled until a State is chosen. */
function buildLocSelects() {
  const dims = ["country", "state", "town"];
  const visibleDims = dims.filter(dim => document.getElementById("sel-" + dim));
  for (let i = 0; i < visibleDims.length; i++) {
    const dim = visibleDims[i], sel = document.getElementById("sel-" + dim);
    const dimIndex = dims.indexOf(dim);
    const pool = state.events.filter(d => dims.slice(0, dimIndex).every(pd => !state.sel[pd] || d.loc[pd] === state.sel[pd]));
    const values = [...new Set(pool.map(d => d.loc[dim]).filter(v => v && v !== "Unlisted"))].sort();
    sel.textContent = "";
    const any = document.createElement("option");
    any.value = ""; any.textContent = "Any";
    sel.appendChild(any);
    for (const v of values) {
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    }
    sel.value = values.includes(state.sel[dim]) ? state.sel[dim] : "";
    state.sel[dim] = sel.value;
    sel.disabled = i > 0 && !state.sel[visibleDims[i - 1]];
    sel.onchange = () => {
      state.sel[dim] = sel.value;
      for (const later of dims.slice(dimIndex + 1)) state.sel[later] = "";
      buildLocSelects();
      render();
    };
  }
}
function matchesCat(d, tag) {
  return d.category === tag;
}
/* True when this event belongs to a solo-class category whose chip is NOT currently
   selected — such events are out of the visible universe entirely (2026-07-18). */
function soloOptedOut(d, f) {
  return SOLO_STYLES.includes(d.category) && !(f || state.filters).cats.has(d.category);
}
function isUnverified(ev) {
  // Local master marks these with research_confidence "low"; the sanitized public
  // export (live site) strips internal fields and carries an added `unverified: true`
  // flag instead. Honor both so the toggle works locally AND on danceeventviewer.net.
  return !!(ev && (ev.unverified === true || ev.research_confidence === "low"));
}
function matchesFilters(d) {
  const f = state.filters;
  // Shared-set landing (2026-07-17): a ?events= link pins the view to exactly those events;
  // all other filters/scope are bypassed so the recipient sees precisely what was shared.
  if (state.eventKeys.size) return !!(d.ev && typeof d.ev.key === "string" && state.eventKeys.has(d.ev.key));
  // Regional default (Phase 0, 2026-07-17): out-of-region events (state not in the
  // Southeast-8 — includes null/unknown/international) only show while the
  // "Traveling? Show national events" toggle is on. Past-gating is separate (showPast).
  if (!state.showNational && !isRegional(d.ev) && !locScopeActive()) return false;
  // Unverified events (research_confidence "low") hide until the "Unverified" toggle is on (2026-07-20, Sean).
  if (!state.showUnverified && isUnverified(d.ev)) return false;
  // Solo styles are strictly OPT-IN (2026-07-18, Sean): a solo-class category (Ballet,
  // Jazz, Hip Hop, Contemporary, Heels, Pom, Musical Theatre, Dance Fit) is shown ONLY
  // while its own chip is selected — never under the default "All styles" state, and
  // never dragged in by selecting a partner style. Shared ?events= links still bypass
  // everything above (deliberate); a shared ?style=<solo> URL selects the chip, which
  // satisfies this gate. soloOptedOut() must stay in sync with this rule — the status
  // line's "of N" total uses it so the default view keeps reading "N of N shown".
  if (soloOptedOut(d, f)) return false;
  if (f.cats.size && ![...f.cats].some(tag => matchesCat(d, tag))) return false;
  if (f.days.size && !f.days.has(d.day)) return false;
  // The area chips (default Pensacola + Mobile) are the coarse LOCAL scope. An explicit
  // State/Town pick is a finer, deliberate location choice, so it overrides the area
  // chips rather than AND-ing with them — otherwise picking "California" matches the
  // cascade yet the Pensacola/Mobile area default hides every result (2026-07-23, Sean).
  if (f.areas.size && !locScopeActive() && !f.areas.has(d.loc.area)) return false;
  for (const dim of ["country", "state", "town"])
    if (state.sel[dim] && d.loc[dim] !== state.sel[dim]) return false;
  if (f.kinds.size && !f.kinds.has(d.kind)) return false;
  // Free-text search (2026-07-20, Sean): every whitespace-separated term must appear somewhere
  // in the event's name, venue, style, or derived city/state/area. Case-insensitive; narrows
  // within the current scope (does not override the National/Unverified/Past gates above).
  if (state.search) {
    const ev = d.ev || {};
    const hay = [ev.name, ev.venue, ev.style, d.loc && d.loc.town, d.loc && d.loc.state, d.loc && d.loc.area]
      .filter(Boolean).join(" ").toLowerCase();
    for (const term of state.search.split(/\s+/))
      if (term && !hay.includes(term)) return false;
  }
  return true;
}

/* ---------- share (added 2026-07-13, Sean: "share and favorite buttons") ----------
   Native share sheet where available (mobile Safari/Chrome); clipboard copy everywhere
   else. The site has no per-event deep links, so the shared text carries the event's
   own details (name, schedule, venue) plus a link to the calendar itself — the
   recipient gets the info even though the URL always points at the homepage. */
function shareTextFor(ev) {
  // 2026-07-17 (Sean: "make the part that we share look more attractive... draw people to
  // the site"): emoji-structured share card instead of a bare text blob. The link itself
  // unfurls into the warm banner via the site's Open Graph tags (root page included).
  const parts = ["\ud83d\udc83\ud83d\udd7a " + ev.name.trim()];
  const sched = scheduleText(ev);
  if (sched) parts.push("\ud83d\udcc5 " + sched);
  if (typeof ev.venue === "string" && ev.venue.trim()) parts.push("\ud83d\udccd " + ev.venue.trim());
  if (typeof ev.cost === "string" && ev.cost.trim()) parts.push("\ud83c\udfab " + ev.cost.trim());
  parts.push("");
  parts.push("Found on Dance Event Viewer \u2014 dance events across the South, all in one place \u2728");
  return parts.join("\n");
}
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
function flashShareCopied(btn) {
  const original = btn.textContent;
  btn.textContent = "✓";
  btn.classList.add("copied");
  btn.setAttribute("aria-label", "Link copied!");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("copied");
    btn.setAttribute("aria-label", "Share this event");
  }, 1800);
}
async function handleShare(ev, btn) {
  const text = shareTextFor(ev);
  // Per-event share pages (2026-07-17): each event has /e/<key>.html with its OWN link
  // preview (name, schedule, flyer) that instantly redirects here — so shared links show
  // THE dance, not a generic card. Falls back to the page URL just in case.
  const url = ev.key ? `${location.origin}/e/${ev.key}.html` : location.origin + location.pathname;
  if (navigator.share) {
    try {
      await navigator.share({ title: ev.name.trim(), text, url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;   // user cancelled the share sheet — not an error
      // real failure (e.g. share unsupported for this data) — fall through to clipboard below
    }
  }
  const ok = await copyText(`${text}\n${url}`);
  if (ok) flashShareCopied(btn);
}

/* ============================================================================
   Multi-select share — "share several dances as one" (2026-07-17, Sean:
   "make it an option to share multiple dances at one time... make it look good
   together... (three dances all this weekend!)... without cluttering the chat").

   Flow: tap "Share several" → each card gets a select toggle → a floating bar
   tracks the count → "Share these" opens ONE lovely combined post (smart headline
   like "Three dances this weekend!", concise event list, a link that lands the
   recipient on exactly those dances, plus copy-text and save-as-image options).
   Built on the same navigator.share / clipboard pattern as single-event share.
   ============================================================================ */
const NUMBER_WORDS = ["zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
  "Eight", "Nine", "Ten", "Eleven", "Twelve"];
function numberWord(n) { return (n >= 1 && n <= 12) ? NUMBER_WORDS[n] : String(n); }

/* Which near-future "window" a single dance falls in, from its next date. These are the
   crisp, warm buckets people actually think in. Weekend (Sat/Sun in the upcoming weekend)
   is checked before the generic "this week"; "tomorrow" is kept separate so a weekday
   next-day reads as "tomorrow" rather than a flat "this week". (2026-07-17) */
function comboBucket(next, t0) {
  if (!next) return "undated";
  const ahead = Math.round((new Date(next.getFullYear(), next.getMonth(), next.getDate()) - t0) / 86400000);
  if (ahead < 0) return "later";
  if (ahead === 0) return "today";
  if (ahead === 1) return "tomorrow";
  const untilSat = 6 - t0.getDay();
  const isWeekend = next.getDay() === 0 || next.getDay() === 6;
  if (isWeekend && ahead <= untilSat + 1) return "weekend";
  if (ahead <= untilSat) return "thisweek";
  if (ahead <= untilSat + 7) return "nextweek";
  return "later";
}
/* Today's dances read as "tonight" (these are evening socials) unless every one of them
   is clearly a daytime event (starts before 4pm) — then "today". */
function comboTodayWord(its) {
  const daytime = its.every(it => {
    const t = it.ev && it.ev.start_time;
    return typeof t === "string" && /^\d{1,2}:/.test(t) && Number(t.split(":")[0]) < 16;
  });
  return daytime ? "today" : "tonight";
}
/* ---------------------------------------------------------------------------
   Headline engine (rebuilt 2026-07-23, Sean: "make it so no matter how somebody
   changes it up it says it in a well-thought-out looking way").

   Design: every selected dance lands in one chronological WINDOW. The headline
   then adapts to how many distinct windows are in play:
     • 1 window   → one specific, warm phrase ("...this Monday!", "...on Sat, Aug 9!")
     • 2–3 windows → a compound line, chronological, first segment carries the noun
     • 4+ windows  → collapse to an accurate span summary instead of a run-on
   Within any window, if every dance shares one weekday we NAME it (Sean's rule),
   if they share one date we name the date, if one month we name the month —
   otherwise we fall back to the warm bucket phrase. Nothing here can produce a
   broken or run-on line for any selection, dated or undated.
   --------------------------------------------------------------------------- */
const COMBO_PHRASES = { today: "today", tomorrow: "tomorrow", thisweek: "this week", weekend: "this weekend", nextweek: "next week", later: "later", undated: "coming up" };
// Chronological window order (this-week weekdays precede the weekend they lead into).
const COMBO_ORDER = ["today", "tomorrow", "thisweek", "weekend", "nextweek", "later", "undated"];

function comboShortDate(dt) { return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function comboLongDate(dt) { return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
function comboMonthName(dt) { return dt.toLocaleDateString(undefined, { month: "long" }); }

// If every dated dance in a group shares ONE weekday, return that weekday index (else null).
function comboSoleWeekday(its) {
  const days = its.filter(it => it && it.next).map(it => it.next.getDay());
  return (days.length && days.every(d => d === days[0])) ? days[0] : null;
}
// If every dated dance shares ONE calendar date, return that Date (else null).
function comboSoleDate(its) {
  const ds = its.filter(it => it && it.next).map(it => it.next);
  const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  return (ds.length && ds.every(d => key(d) === key(ds[0]))) ? ds[0] : null;
}
// If every dated dance shares ONE calendar month, return a representative Date (else null).
function comboSoleMonth(its) {
  const ds = its.filter(it => it && it.next).map(it => it.next);
  const key = d => `${d.getFullYear()}-${d.getMonth()}`;
  return (ds.length && ds.every(d => key(d) === key(ds[0]))) ? ds[0] : null;
}

// Short phrase for a window group — kept brief because it sits inside a compound line.
function comboPhrase(key, its) {
  if (key === "today") return comboTodayWord(its);
  if (key === "thisweek") { const wd = comboSoleWeekday(its); return wd === null ? "this week" : DAY_ORDER[wd]; }
  if (key === "nextweek") { const wd = comboSoleWeekday(its); return wd === null ? "next week" : `next ${DAY_ORDER[wd]}`; }
  if (key === "later") {
    const d = comboSoleDate(its); if (d) return `on ${comboShortDate(d)}`;
    const m = comboSoleMonth(its); if (m) return `in ${comboMonthName(m)}`;
    return "later";
  }
  return COMBO_PHRASES[key];
}
// Richer phrase for when the ENTIRE headline is a single window — a touch more specific.
function comboPhraseSolo(key, its) {
  if (key === "thisweek") { const wd = comboSoleWeekday(its); if (wd !== null) return `this ${DAY_ORDER[wd]}`; }
  if (key === "later") {
    const d = comboSoleDate(its); if (d) return `on ${comboLongDate(d)}`;
    const m = comboSoleMonth(its); if (m) return `in ${comboMonthName(m)}`;
    return "in the weeks ahead";
  }
  return comboPhrase(key, its);
}

/* For 4+ distinct windows, a compound line would run on — so summarize the whole set as an
   accurate span. Purely dated sets get a bounded phrase ("this week", "this week & next",
   "over the next three weeks"); anything open-ended reads "in the weeks ahead". */
function comboSpanPhrase(items, t0) {
  const dated = items.filter(it => it && it.next);
  if (!dated.length) return "coming up";
  if (dated.length < items.length) return "in the weeks ahead"; // some undated → open-ended
  const aheads = dated.map(it => Math.round((new Date(it.next.getFullYear(), it.next.getMonth(), it.next.getDate()) - t0) / 86400000));
  const latest = Math.max(...aheads);
  const untilSun = (6 - t0.getDay()) + 1; // days remaining until end of this weekend
  if (latest <= untilSun) return "this week";
  if (latest <= untilSun + 7) return "this week & next";
  const weeks = Math.ceil((latest + 1) / 7);
  return weeks <= 4 ? `over the next ${numberWord(weeks).toLowerCase()} weeks` : "in the weeks ahead";
}

/* The headline: the hook that makes people click. "dance chances" (not "dances") because a
   listing is sometimes a class or workshop, not a social — Sean, 2026-07-17. */
function comboNoun(count) { return `dance chance${count === 1 ? "" : "s"}`; }
function comboHeadline(items, today) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const n = items.length;
  if (!n) return "";
  const groups = new Map();
  for (const it of items) {
    const b = comboBucket(it.next, t0);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(it);
  }
  // A weekend-day "tomorrow" (Saturday when today is Friday) folds into "this weekend"
  // when the set also spans the weekend — so Sat+Sun reads "this weekend", not "tomorrow & …".
  if (groups.has("tomorrow") && groups.has("weekend") &&
      groups.get("tomorrow").every(it => it.next && (it.next.getDay() === 0 || it.next.getDay() === 6))) {
    groups.get("weekend").unshift(...groups.get("tomorrow"));
    groups.delete("tomorrow");
  }
  const present = COMBO_ORDER.filter(k => groups.has(k));

  // 1 window → one specific, warm phrase.
  if (present.length === 1) {
    const k = present[0];
    return `${numberWord(n)} ${comboNoun(n)} ${comboPhraseSolo(k, groups.get(k))}!`;
  }
  // 2–3 windows → chronological compound line; first segment carries the noun.
  if (present.length <= 3) {
    const segs = present.map(k => ({ n: groups.get(k).length, phrase: comboPhrase(k, groups.get(k)) }));
    const parts = segs.map((s, i) => i === 0
      ? `${numberWord(s.n)} ${comboNoun(s.n)} ${s.phrase}`
      : `${numberWord(s.n).toLowerCase()} ${s.phrase}`);
    const body = parts.length === 2
      ? parts.join(" & ")
      : `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
    return body + "!";
  }
  // 4+ windows → an accurate span summary rather than an unwieldy run-on.
  return `${numberWord(n)} ${comboNoun(n)} ${comboSpanPhrase(items, t0)}!`;
}
/* One display date/time line per event — prefers the concrete next occurrence, falls
   back to the recurrence text so multi-day / undated events still read cleanly. */
function comboWhenLine(d) {
  if (d.next) {
    const tr = timeRange(d.ev);
    return tr ? `${fmtDate(d.next)} · ${tr}` : fmtDate(d.next);
  }
  return scheduleText(d.ev) || "";
}
/* Selected events, decorated with their next occurrence and sorted soonest-first. */
function selectedShareItems() {
  const today = new Date();
  const items = state.events
    .filter(d => d && d.ev && typeof d.ev.key === "string" && shareSelection.has(d.ev.key))
    .map(d => ({ ...d, next: nextOccurrence(d.ev, today) }));
  items.sort((a, b) => (a.next ? a.next.getTime() : Infinity) - (b.next ? b.next.getTime() : Infinity));
  return items;
}
/* A link that reopens the site showing EXACTLY these dances (see applyUrl ?events=). */
function comboShareUrl(items) {
  const keys = items.map(d => d.ev.key).filter(Boolean);
  const base = location.origin + location.pathname;
  return keys.length ? `${base}?events=${keys.join("|")}` : base;
}
/* The shared text block — concise, emoji-structured, one dance per stanza. Matches the
   single-event share voice so both feel like the same site. */
function buildComboText(items, headline, url) {
  const lines = [`✨ ${headline} ✨`, ""];
  for (const d of items) {
    const ev = d.ev;
    lines.push("💃 " + ev.name.trim());
    const when = comboWhenLine(d);
    if (when) lines.push("📅 " + when);
    if (typeof ev.venue === "string" && ev.venue.trim()) lines.push("📍 " + ev.venue.trim());
    if (typeof ev.cost === "string" && ev.cost.trim()) lines.push("🎫 " + ev.cost.trim());
    lines.push("");
  }
  lines.push("See them all on Dance Event Viewer ✨");
  lines.push(url);
  return lines.join("\n");
}

let _comboPlaced = false;
function makeShareMultipleBtn() {
  const t = document.createElement("button");
  t.type = "button";
  t.id = "share-several-toggle";
  t.className = "past-toggle share-several-toggle";
  t.setAttribute("aria-pressed", String(state.selectMode));
  t.title = "Pick several dances and share them as one lovely post — instead of posting each one separately.";
  t.textContent = state.selectMode ? "✕ Done selecting" : "✦ Share multiple";
  t.addEventListener("click", () => setSelectMode(!state.selectMode));
  return t;
}
/* First timeline bucket heading (currently "TODAY") carries the Share-multiple button on
   its right side (2026-07-20, Sean); reset _comboPlaced each render() so it lands once. */
function bucketHeadingEl(label) {
  const h = document.createElement("h2");
  h.className = "bucket-heading";
  if (!_comboPlaced && label !== "Past") {
    _comboPlaced = true;
    h.classList.add("bucket-heading--action");
    const span = document.createElement("span");
    span.className = "bucket-heading-label";
    span.textContent = label;
    h.append(span, makeShareMultipleBtn());
  } else {
    h.textContent = label;
  }
  return h;
}
function setSelectMode(on) {
  state.selectMode = on;
  document.body.classList.toggle("selecting", on);
  const t = document.getElementById("share-several-toggle");
  if (t) {
    t.setAttribute("aria-pressed", String(on));
    t.textContent = on ? "✕ Done selecting" : "✦ Share multiple";
  }
  if (!on) shareSelection.clear();
  updateComboBar();
  render();
}
function updateComboBar() {
  const bar = document.getElementById("combo-bar");
  if (!bar) return;
  const n = shareSelection.size;
  bar.hidden = !state.selectMode;
  const count = bar.querySelector("#combo-bar-count");
  if (count) count.textContent = n === 0 ? "Tap dances to add them" : `${n} dance${n === 1 ? "" : "s"} selected`;
  const shareBtn = bar.querySelector("#combo-share-btn");
  if (shareBtn) shareBtn.disabled = n < 1;
  const clearBtn = bar.querySelector("#combo-clear-btn");
  if (clearBtn) clearBtn.disabled = n === 0;
}
/* Toggle one event in/out of the share set and keep every on-screen copy of that card
   (a card can appear once per view, plus popups) visually in sync. */
function toggleShareSelect(ev) {
  const key = ev && typeof ev.key === "string" ? ev.key : null;
  if (!key) return;
  const now = !shareSelection.has(key);
  now ? shareSelection.add(key) : shareSelection.delete(key);
  const esc = (window.CSS && CSS.escape) ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
  document.querySelectorAll(`.card[data-key="${esc}"]`).forEach(c => c.classList.toggle("is-selected", now));
  document.querySelectorAll(`.card-action-select[data-key="${esc}"]`).forEach(b => {
    b.setAttribute("aria-pressed", String(now));
    b.setAttribute("aria-label", now ? "Remove from share set" : "Add to share set");
    b.textContent = now ? "✓" : "+";
  });
  updateComboBar();
}

async function handleComboShare(items, btn) {
  const today = new Date();
  const headline = comboHeadline(items, today);
  const url = comboShareUrl(items);
  const text = buildComboText(items, headline, url);
  if (navigator.share) {
    try {
      await navigator.share({ title: headline, text });   // text already carries the link
      return true;
    } catch (e) {
      if (e && e.name === "AbortError") return false;      // user cancelled — not an error
      // fall through to clipboard
    }
  }
  const ok = await copyText(text);
  if (ok && btn) flashComboBtn(btn, "Copied ✓");
  return ok;
}
function flashComboBtn(btn, label) {
  const original = btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  btn.textContent = label;
  btn.classList.add("copied");
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    btn.textContent = btn.dataset.label || original;
    btn.classList.remove("copied");
  }, 1800);
}

/* The "lovely share" preview — a warm, gradient-headed card that shows exactly how the
   combined post reads, then hands off to the native share sheet / clipboard / image. */
function openComboShareModal(items) {
  if (!items.length) return;
  const today = new Date();
  const headline = comboHeadline(items, today);
  const backdrop = document.createElement("div");
  backdrop.className = "cal-pop-backdrop";
  const pop = document.createElement("div");
  pop.className = "combo-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-modal", "true");
  pop.setAttribute("aria-label", "Share these dances");

  const close = document.createElement("button");
  close.type = "button"; close.className = "pop-close"; close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  pop.appendChild(close);

  // The visual poster (also the exact thing rendered to an image on "Save image").
  const poster = document.createElement("div");
  poster.className = "combo-poster";
  const head = document.createElement("div");
  head.className = "combo-poster-head";
  const hEl = document.createElement("p");
  hEl.className = "combo-headline"; hEl.textContent = headline;
  const subEl = document.createElement("p");
  subEl.className = "combo-sub"; subEl.textContent = "Dance Event Viewer · all in one place";
  head.append(hEl, subEl);
  poster.appendChild(head);

  const list = document.createElement("ul");
  list.className = "combo-list";
  for (const d of items) {
    const ev = d.ev;
    const li = document.createElement("li");
    li.className = "combo-item";
    const dot = document.createElement("span");
    dot.className = "combo-dot"; dot.setAttribute("aria-hidden", "true"); dot.textContent = "💃";
    const body = document.createElement("div");
    body.className = "combo-item-body";
    const nm = document.createElement("p");
    nm.className = "combo-item-name"; nm.textContent = ev.name.trim();
    body.appendChild(nm);
    const when = comboWhenLine(d);
    if (when) {
      const w = document.createElement("p");
      w.className = "combo-item-when"; w.textContent = when;
      body.appendChild(w);
    }
    const meta = [];
    if (typeof ev.venue === "string" && ev.venue.trim()) meta.push(ev.venue.trim());
    if (typeof ev.cost === "string" && ev.cost.trim()) meta.push(ev.cost.trim());
    if (meta.length) {
      const m = document.createElement("p");
      m.className = "combo-item-meta"; m.textContent = meta.join("  ·  ");
      body.appendChild(m);
    }
    li.append(dot, body);
    list.appendChild(li);
  }
  poster.appendChild(list);
  const foot = document.createElement("p");
  foot.className = "combo-poster-foot"; foot.textContent = "danceeventviewer.net ✨";
  poster.appendChild(foot);
  pop.appendChild(poster);

  // Actions
  const actions = document.createElement("div");
  actions.className = "combo-actions";
  const shareBtn = document.createElement("button");
  shareBtn.type = "button"; shareBtn.className = "combo-btn combo-btn-primary";
  shareBtn.textContent = navigator.share ? "Share these dances" : "Copy to share";
  shareBtn.addEventListener("click", () => handleComboShare(items, shareBtn));
  const copyBtn = document.createElement("button");
  copyBtn.type = "button"; copyBtn.className = "combo-btn";
  copyBtn.textContent = "Copy text";
  copyBtn.addEventListener("click", async () => {
    const url = comboShareUrl(items);
    const ok = await copyText(buildComboText(items, headline, url));
    if (ok) flashComboBtn(copyBtn, "Copied ✓");
  });
  const imgBtn = document.createElement("button");
  imgBtn.type = "button"; imgBtn.className = "combo-btn";
  imgBtn.textContent = "Save image";
  imgBtn.addEventListener("click", () => handleComboShareImage(items, imgBtn));
  actions.append(shareBtn, copyBtn, imgBtn);
  pop.appendChild(actions);

  backdrop.appendChild(pop);
  const done = () => { backdrop.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") done(); };
  close.addEventListener("click", done);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(); });
  document.addEventListener("keydown", esc);
  document.body.appendChild(backdrop);
  close.focus();
}

/* Render the same design to a PNG so a whole weekend of dances can go into a chat as ONE
   image. Reads the live theme colors so it always matches the site. Pure canvas — no
   external libs, no tainting (all text). Shares the file where supported, else downloads. */
function renderComboPoster(items, headline) {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => { const s = cs.getPropertyValue(name).trim(); return s || fallback; };
  const bg = v("--bg", "#0b0c15");
  const bgCard = v("--bg-card", "#1b1822");
  const text = v("--text", "#f6eadf");
  const textDim = v("--text-dim", "#a99ca5");
  const accent = v("--accent", "#e8785b");
  const accentPink = v("--accent-pink", "#db8d85");

  const W = 1080, PAD = 72, scale = 2;   // scale for crisp output
  // Measure to compute height first (two passes: measure, then draw).
  const measure = document.createElement("canvas").getContext("2d");
  const contentW = W - PAD * 2;
  const wrap = (ctx, str, font, maxW) => {
    ctx.font = font;
    const words = String(str).split(/\s+/);
    const out = []; let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    if (line) out.push(line);
    return out;
  };
  const F_HEAD = "700 58px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const F_SUB = "500 26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const F_NAME = "700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const F_WHEN = "500 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const F_META = "400 27px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const F_FOOT = "600 27px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  const headLines = wrap(measure, headline, F_HEAD, contentW - 40);
  const headBand = 60 + headLines.length * 66 + 44;   // top pad + lines + subtitle
  const blocks = items.map(d => {
    const nameLines = wrap(measure, d.ev.name.trim(), F_NAME, contentW - 70);
    const when = comboWhenLine(d);
    const meta = [];
    if (typeof d.ev.venue === "string" && d.ev.venue.trim()) meta.push(d.ev.venue.trim());
    if (typeof d.ev.cost === "string" && d.ev.cost.trim()) meta.push(d.ev.cost.trim());
    const metaLine = meta.join("   ·   ");
    const metaLines = metaLine ? wrap(measure, metaLine, F_META, contentW - 70) : [];
    let h = 22 + nameLines.length * 46;
    if (when) h += 40;
    h += metaLines.length * 36;
    h += 22;
    return { nameLines, when, metaLines, h };
  });
  const listH = blocks.reduce((s, b) => s + b.h, 0) + (blocks.length - 1) * 14;
  const footH = 90;
  const H = headBand + 40 + listH + footH + PAD * 0.4;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = Math.round(H) * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "top";

  // Background
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Header gradient band
  const grad = ctx.createLinearGradient(0, 0, W, headBand);
  grad.addColorStop(0, accent); grad.addColorStop(1, accentPink);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, headBand);
  // Headline (dark ink on the warm band for contrast)
  ctx.fillStyle = "#1a1119";
  ctx.font = F_HEAD;
  let y = 56;
  for (const ln of headLines) { ctx.fillText(ln, PAD, y); y += 66; }
  ctx.font = F_SUB; ctx.fillStyle = "rgba(26,17,25,.82)";
  ctx.fillText("Dance Event Viewer · all in one place", PAD, y + 4);

  // Event list
  y = headBand + 40;
  ctx.textAlign = "left";
  for (const b of blocks) {
    // accent tick
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(PAD, y + 6, 8, b.h - 18, 4); ctx.fill();
    const tx = PAD + 34;
    let ly = y + 6;
    ctx.fillStyle = text; ctx.font = F_NAME;
    for (const ln of b.nameLines) { ctx.fillText(ln, tx, ly); ly += 46; }
    if (b.when) { ctx.fillStyle = accentPink; ctx.font = F_WHEN; ctx.fillText(b.when, tx, ly + 2); ly += 40; }
    ctx.fillStyle = textDim; ctx.font = F_META;
    for (const ln of b.metaLines) { ctx.fillText(ln, tx, ly + 2); ly += 36; }
    y += b.h + 14;
  }
  // Footer
  ctx.fillStyle = accent; ctx.font = F_FOOT;
  ctx.fillText("danceeventviewer.net  ✨", PAD, H - footH + 18);

  return canvas;
}
async function handleComboShareImage(items, btn) {
  let canvas;
  try { canvas = renderComboPoster(items, comboHeadline(items, new Date())); }
  catch (e) { if (btn) flashComboBtn(btn, "Couldn't build image"); return; }
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if (!blob) { if (btn) flashComboBtn(btn, "Couldn't build image"); return; }
  const fname = "dances-to-share.png";
  // Try a native image share first (mobile) — the whole point is ONE image into a chat.
  if (navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], fname, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: comboHeadline(items, new Date()) });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  if (btn) flashComboBtn(btn, "Saved ✓");
}

/* Inject the "Share several" entry toggle and the floating action bar. Done in JS (not
   index.html) so this feature stays self-contained and independent of other in-flight
   edits to the page markup. */
function ensureComboUI() {
  // "Share multiple" now renders on the first timeline heading row — see
  // makeShareMultipleBtn() / bucketHeadingEl() (relocated 2026-07-20, Sean).
  if (!document.getElementById("combo-bar")) {
    const bar = document.createElement("div");
    bar.id = "combo-bar"; bar.className = "combo-bar"; bar.hidden = true;
    bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Share selected dances");
    const count = document.createElement("span");
    count.id = "combo-bar-count"; count.className = "combo-bar-count";
    count.textContent = "Tap dances to add them";
    const spacer = document.createElement("span"); spacer.className = "combo-bar-spacer";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button"; clearBtn.id = "combo-clear-btn"; clearBtn.className = "combo-bar-btn combo-bar-clear";
    clearBtn.textContent = "Clear"; clearBtn.disabled = true;
    clearBtn.addEventListener("click", () => {
      const keys = [...shareSelection];
      shareSelection.clear();
      for (const k of keys) {
        const esc = (window.CSS && CSS.escape) ? CSS.escape(k) : k;
        document.querySelectorAll(`.card[data-key="${esc}"]`).forEach(c => c.classList.remove("is-selected"));
        document.querySelectorAll(`.card-action-select[data-key="${esc}"]`).forEach(b => {
          b.setAttribute("aria-pressed", "false");
          b.setAttribute("aria-label", "Add to share set");
          b.textContent = "+";
        });
      }
      updateComboBar();
    });
    const shareBtn = document.createElement("button");
    shareBtn.type = "button"; shareBtn.id = "combo-share-btn"; shareBtn.className = "combo-bar-btn combo-bar-share";
    shareBtn.textContent = "Share these"; shareBtn.disabled = true;
    shareBtn.addEventListener("click", () => {
      const items = selectedShareItems();
      if (items.length) openComboShareModal(items);
    });
    bar.append(count, spacer, clearBtn, shareBtn);
    document.body.appendChild(bar);
  }
  updateComboBar();
}

/* Banner shown when a shared-set link (?events=…) is open: tells the recipient they're
   viewing a curated set and offers a one-tap escape to the full calendar. */
function ensureSharedSetBanner() {
  const existing = document.getElementById("shared-set-banner");
  if (!state.eventKeys.size) { if (existing) existing.remove(); return existing ? true : false; }
  if (existing) return true;
  const results = document.getElementById("results");
  if (!results || !results.parentNode) return false;
  const bar = document.createElement("div");
  bar.id = "shared-set-banner"; bar.className = "shared-set-banner";
  const msg = document.createElement("span");
  const n = state.eventKeys.size;
  msg.textContent = `💃 Someone shared ${n === 1 ? "a dance" : n + " dances"} with you`;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "shared-set-clear";
  btn.textContent = "See all events";
  btn.addEventListener("click", () => {
    state.eventKeys = new Set();
    syncUrl();
    ensureSharedSetBanner();
    render();
  });
  bar.append(msg, btn);
  results.parentNode.insertBefore(bar, results);
  return true;
}

/* Favorite + share icon buttons, top-right corner of every card — built once here so
   Timeline, Grid, List (expanded row), Map popup, and Calendar popup all get them for
   free, since they all render through this same card() function. */
function cardActions(ev) {
  const wrap = document.createElement("div");
  wrap.className = "card-actions";

  const favBtn = document.createElement("button");
  favBtn.type = "button";
  favBtn.className = "card-action-btn card-action-favorite";
  const hasKey = typeof ev.key === "string" && ev.key;
  const isFav = hasKey && favorites.has(ev.key);
  favBtn.setAttribute("aria-pressed", String(isFav));
  favBtn.setAttribute("aria-label", isFav ? "Remove from favorites" : "Add to favorites");
  favBtn.textContent = isFav ? "♥" : "♡";
  if (!hasKey) {
    favBtn.disabled = true;
    favBtn.title = "This event can't be favorited yet";
  } else {
    favBtn.addEventListener("click", () => {
      const nowOn = !favorites.has(ev.key);
      nowOn ? favorites.add(ev.key) : favorites.delete(ev.key);
      saveFavorites(favorites);
      favBtn.setAttribute("aria-pressed", String(nowOn));
      favBtn.setAttribute("aria-label", nowOn ? "Remove from favorites" : "Add to favorites");
      favBtn.textContent = nowOn ? "♥" : "♡";
    });
  }
  wrap.appendChild(favBtn);

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "card-action-btn card-action-share";
  shareBtn.setAttribute("aria-label", "Share this event");
  shareBtn.textContent = "⤴";
  shareBtn.addEventListener("click", () => handleShare(ev, shareBtn));
  wrap.appendChild(shareBtn);

  // Multi-select toggle — hidden by CSS unless body.selecting is on (Share several mode).
  const selBtn = document.createElement("button");
  selBtn.type = "button";
  selBtn.className = "card-action-btn card-action-select";
  const selKey = (typeof ev.key === "string" && ev.key) ? ev.key : null;
  const isSel = selKey && shareSelection.has(selKey);
  selBtn.setAttribute("aria-pressed", String(!!isSel));
  selBtn.setAttribute("aria-label", isSel ? "Remove from share set" : "Add to share set");
  selBtn.textContent = isSel ? "✓" : "+";
  if (!selKey) {
    selBtn.disabled = true;
    selBtn.title = "This event can't be shared yet";
  } else {
    selBtn.dataset.key = selKey;
    selBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleShareSelect(ev); });
  }
  wrap.appendChild(selBtn);

  return wrap;
}

/* ---------- rendering (whitelist only, textContent only) ---------- */
function card(d, { showWhen, isPast }) {
  const { ev } = d;
  const el = document.createElement("article");
  el.className = "card";
  if (isPast) el.classList.add("is-past");
  if (typeof ev.key === "string" && ev.key) el.dataset.key = ev.key;
  if (state.selectMode && typeof ev.key === "string" && shareSelection.has(ev.key)) el.classList.add("is-selected");
  // In "Share several" mode, tapping anywhere on the card's own surface toggles selection —
  // but not when the tap lands on a real control (flyer, venue-map, links, the action buttons).
  if (state.selectMode && typeof ev.key === "string" && ev.key) {
    el.classList.add("selectable");
    el.addEventListener("click", (e) => {
      if (e.target.closest("a, button, input, textarea, select, .card-art-trigger")) return;
      toggleShareSelect(ev);
    });
  }
  el.appendChild(cardActions(ev));

  const art = document.createElement("div");
  art.className = "card-art";
  const logoPath = logoFor(ev.key);
  if (typeof logoPath === "string" && logoPath) {
    // Wrapped in a real <button> (not a click handler on the <img>) so it's keyboard-
    // operable and has correct semantics for free, matching the venue-button pattern above.
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "card-art-trigger";
    trigger.setAttribute("aria-label", `Enlarge flyer for ${ev.name.trim()}`);
    const img = document.createElement("img");
    img.src = encodeURI(logoPath);
    img.alt = "";                                  // decorative — the name is in the heading
    img.loading = "lazy";
    img.addEventListener("error", () => art.remove());
    trigger.appendChild(img);
    trigger.addEventListener("click", () => openImageLightbox(logoPath, ev.name.trim()));
    art.appendChild(trigger);
  }
  el.appendChild(art);

  const badges = document.createElement("div");
  badges.className = "badges";
  if (d.category) {
    const b = document.createElement("span");
    b.className = "badge"; b.textContent = d.category;
    badges.appendChild(b);
  }
  if (ev.type === "tentative") {
    const b = document.createElement("span");
    b.className = "badge warn"; b.textContent = "Unconfirmed";
    badges.appendChild(b);
  }
  if (isPast) {
    const b = document.createElement("span");
    b.className = "badge past"; b.textContent = "Past";
    badges.appendChild(b);
  }
  if (badges.children.length) el.appendChild(badges);

  const h = document.createElement("h3");
  h.textContent = ev.name.trim();
  el.appendChild(h);

  if (showWhen && d.next) {
    const when = document.createElement("p");
    when.className = "when";
    const tr = timeRange(ev);
    const link = typeof ev.source_url === "string" && /^https?:\/\//i.test(ev.source_url.trim())
      ? ev.source_url.trim() : null;
    if (tr) {
      when.textContent = `${fmtDate(d.next)} · ${tr}`;
    } else if (link) {
      // No start/end time on record (e.g. multi-day WSDC conventions) — show the date,
      // then a link to the event's own page in place of the time (Sean, 2026-07-12).
      when.append(`${fmtDate(d.next)} · `);
      const a = document.createElement("a");
      a.href = link; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "View event ↗";
      when.appendChild(a);
    } else {
      when.textContent = fmtDate(d.next);
    }
    el.appendChild(when);
  }
  const sched = scheduleText(ev);
  if (sched) {
    const p = document.createElement("p");
    p.className = "schedule"; p.textContent = sched;
    el.appendChild(p);
  }
  if (typeof ev.venue === "string" && ev.venue.trim()) {
    const coords = coordsFor(d);
    if (coords) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "venue venue-clickable";
      b.textContent = ev.venue.trim();
      b.title = "Show this location on a map";
      b.addEventListener("click", () => openAddressPopup(ev.venue.trim(), coords));
      el.appendChild(b);
    } else {
      const p = document.createElement("p");
      p.className = "venue"; p.textContent = ev.venue.trim();
      el.appendChild(p);
    }
  }
  if (typeof ev.cost === "string" && ev.cost.trim()) {
    const p = document.createElement("p");
    p.className = "cost"; p.textContent = ev.cost.trim();
    el.appendChild(p);
  }
  // Public link (whitelisted): only rendered when source_url is an explicit http(s) URL.
  if (typeof ev.source_url === "string" && /^https?:\/\//i.test(ev.source_url.trim())) {
    const a = document.createElement("a");
    a.className = "card-link";
    a.href = ev.source_url.trim();
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "More info / register ↗";
    el.appendChild(a);
  }
  el.appendChild(feedbackWidget(ev));
  return el;
}

/* List view row: title only, expands in place to the same details as a card.
   Built for small screens — nothing but the name shows until it's tapped. */
function listRow(d, isPast) {
  const { ev } = d;
  const li = document.createElement("li");
  li.className = "list-row";
  if (isPast) li.classList.add("is-past");

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "list-row-toggle";
  btn.setAttribute("aria-expanded", "false");

  const title = document.createElement("span");
  title.className = "list-row-title";
  title.textContent = ev.name.trim();
  btn.appendChild(title);

  const chevron = document.createElement("span");
  chevron.className = "list-row-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  btn.appendChild(chevron);

  li.appendChild(btn);

  const details = document.createElement("div");
  details.className = "list-row-details";
  details.hidden = true;
  li.appendChild(details);

  let built = false;
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    if (!open && !built) {
      details.appendChild(card(d, { showWhen: true, isPast }));
      built = true;
    }
    btn.setAttribute("aria-expanded", String(!open));
    details.hidden = open;
    // Activity Pulse signal — only when opening (not collapsing), matches "opening/expanding
    // an event card" in Live_Activity_Feed_Prompt.md's event-interest signal list.
    if (!open && typeof ev.key === "string") {
      window.dispatchEvent(new CustomEvent("activity-signal", { detail: { type: "event_viewed", eventId: ev.key } }));
    }
  });

  return li;
}

/* "Wrong info?" widget: opens the visitor's own email app via mailto (no data is sent
   anywhere by this page itself), or copies the message for pasting into Messenger. */
function feedbackWidget(ev) {
  const wrap = document.createElement("div");
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "fb-toggle";
  toggle.textContent = "Wrong info? Need to add info?";
  toggle.setAttribute("aria-expanded", "false");
  wrap.appendChild(toggle);

  const form = document.createElement("div");
  form.className = "fb-form"; form.hidden = true;

  const desc = document.createElement("textarea");
  desc.rows = 3; desc.placeholder = "What's wrong, or what should be added?";
  desc.setAttribute("aria-label", "What is wrong or missing");
  const link = document.createElement("input");
  link.type = "url"; link.placeholder = "Link to the correct info (flyer, post, website)";
  link.setAttribute("aria-label", "Link to the correct info");

  // Flyer photo upload (2026-07-13, Sean: "should allow you to upload a flyer for the event,
  // instantly") — sits alongside the link field rather than replacing it, since a link is still
  // useful for non-image corrections. When a photo is attached, send() routes through the real
  // Submissions pipeline (SUBMIT_ENDPOINT) tagged submission_kind:"correction" instead of the
  // plain-text SEND_ENDPOINT mail relay below, since that relay isn't built for attachments.
  const photoLabel = document.createElement("label");
  photoLabel.className = "fb-photo-label";
  photoLabel.textContent = "Or attach a corrected/updated flyer photo (optional)";
  const photoInput = document.createElement("input");
  photoInput.type = "file"; photoInput.accept = "image/*"; photoInput.className = "fb-photo-input";
  photoInput.setAttribute("aria-label", "Attach a flyer photo");
  const photoPreview = document.createElement("img");
  photoPreview.className = "fb-photo-preview"; photoPreview.alt = "Flyer preview"; photoPreview.hidden = true;
  let photoDataUrl = null;
  photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];
    photoDataUrl = null;
    if (!file) { photoPreview.hidden = true; return; }
    if (file.size > MAX_CORRECTION_PHOTO_BYTES) {
      status.textContent = "That photo is a bit large — try a smaller image (under 8MB).";
      photoInput.value = "";
      photoPreview.hidden = true;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = reader.result;
      photoPreview.src = photoDataUrl;
      photoPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  });

  const who = document.createElement("input");
  who.type = "text"; who.placeholder = "Your name";
  who.setAttribute("aria-label", "Your name");

  const actions = document.createElement("div");
  actions.className = "fb-actions";
  const send = document.createElement("button");
  send.type = "button"; send.className = "fb-send"; send.textContent = "Send";
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "fb-alt"; cancel.textContent = "Cancel";
  actions.append(send, cancel);

  const status = document.createElement("p");
  status.className = "fb-status"; status.setAttribute("role", "status");

  form.append(desc, link, photoLabel, photoInput, photoPreview, who, actions, status);
  wrap.appendChild(form);

  const SUBJECT = "Dance Event Viewer Listing Update Request";
  const body = () => [
    `Event: ${ev.name}`,
    `Listing: ${scheduleText(ev) || "(no schedule on card)"}${typeof ev.key === "string" ? `  [id: ${ev.key}]` : ""}`,
    "",
    "What needs fixing/adding:",
    desc.value.trim(),
    "",
    `Link to correct info: ${link.value.trim() || "(none given)"}`,
    `From: ${who.value.trim() || "(no name given)"}`,
    "",
    "Sent from the Dance Event Viewer (beta).",
  ].join("\n");

  toggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
    toggle.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) {
      desc.focus();
      // Activity Pulse signal — opening the correction/"open invite" form (Live_Activity_Feed_Prompt.md
      // Step 1, item 3), only on opening, not on cancel.
      window.dispatchEvent(new CustomEvent("activity-signal", { detail: { type: "open_invite" } }));
    }
  });
  cancel.addEventListener("click", () => {
    form.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  send.addEventListener("click", async () => {
    // Photo attached → route through the real Submissions pipeline as a "correction", tagged
    // with event_key so it never gets mistaken for a new-event submission in the pending queue.
    // A photo-only send is valid (2026-07-13, Sean's one-step flyer flow) — the description is
    // only required when there's no photo to speak for itself.
    const photoFile = photoInput.files && photoInput.files[0];
    if (!photoFile && !desc.value.trim()) { status.textContent = "Please describe what's wrong or missing first."; return; }
    if (photoFile) {
      if (!SUBMIT_ENDPOINT) {
        status.textContent = "Photo uploads aren't quite live yet — please use the link field instead, or email ralphseanevans@gmail.com.";
        return;
      }
      if (!photoDataUrl) {
        status.textContent = "Still reading that photo — try again in a moment.";
        return;
      }
      send.disabled = true;
      status.textContent = "Sending…";
      try {
        const mime = photoDataUrl.split("data:")[1].split(";")[0];
        const base64 = photoDataUrl.split(",")[1];
        const payload = {
          action: "submit",
          intake_method: "flyer",
          submission_kind: "correction",
          event_key: typeof ev.key === "string" ? ev.key : "",
          type: typeof ev.type === "string" ? ev.type : "",
          name: ev.name,
          flyer_mime: mime,
          flyer_base64: base64,
          source_note: desc.value.trim(),
          source_url: link.value.trim(),
          contact_name: who.value.trim(),
        };
        const res = await fetch(SUBMIT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "text/plain" }, // avoids a CORS preflight against Apps Script
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (data && data.ok) {
          status.textContent = data.published
            ? "Your flyer is live! Give it a couple of minutes, then refresh to see it on this listing."
            : "Sent for review — the flyer will appear on this listing once approved. Thanks!";
          desc.value = ""; link.value = ""; who.value = "";
          photoInput.value = ""; photoDataUrl = null; photoPreview.hidden = true;
          setTimeout(() => { form.hidden = true; toggle.setAttribute("aria-expanded", "false"); status.textContent = ""; send.disabled = false; }, 2500);
        } else {
          send.disabled = false;
          status.textContent = (data && data.error) || "Couldn't send — please try again, or email ralphseanevans@gmail.com.";
        }
      } catch (e) {
        send.disabled = false;
        status.textContent = "Couldn't send — please email ralphseanevans@gmail.com instead.";
      }
      return;
    }

    // Text-only correction → also routed through the Submissions pipeline (2026-07-13,
    // Sean's hourly auto-fix: trusted senders' fixes are queued and applied to the
    // listing data automatically; everyone else's land in Sean's review queue).
    if (SUBMIT_ENDPOINT) {
      send.disabled = true;
      status.textContent = "Sending…";
      try {
        const payload = {
          action: "submit",
          intake_method: "form",
          submission_kind: "correction",
          event_key: typeof ev.key === "string" ? ev.key : "",
          type: typeof ev.type === "string" ? ev.type : "",
          name: ev.name,
          source_note: desc.value.trim(),
          source_url: link.value.trim(),
          contact_name: who.value.trim(),
        };
        const res = await fetch(SUBMIT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "text/plain" }, // avoids a CORS preflight against Apps Script
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (data && data.ok) {
          status.textContent = data.queued
            ? "Got it — your fix is queued and usually lands on the listing within the hour."
            : "Sent — thanks for helping keep the calendar accurate!";
          desc.value = ""; link.value = ""; who.value = "";
          setTimeout(() => { form.hidden = true; toggle.setAttribute("aria-expanded", "false"); status.textContent = ""; send.disabled = false; }, 2500);
        } else {
          send.disabled = false;
          status.textContent = (data && data.error) || "Couldn't send — please try again, or email ralphseanevans@gmail.com.";
        }
      } catch (e) {
        send.disabled = false;
        status.textContent = "Couldn't send — please email ralphseanevans@gmail.com instead.";
      }
    } else if (SEND_ENDPOINT) {
      // Silent send via Sean's Apps Script mail relay (fallback if the Submissions
      // pipeline endpoint is ever blank; fire-and-forget, no-cors responses are opaque).
      send.disabled = true;
      status.textContent = "Sending…";
      try {
        await fetch(SEND_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ subject: SUBJECT, message: body() }),
        });
        status.textContent = "Sent — thanks for helping keep the calendar accurate!";
        desc.value = ""; link.value = ""; who.value = "";
        setTimeout(() => { form.hidden = true; toggle.setAttribute("aria-expanded", "false"); status.textContent = ""; send.disabled = false; }, 2500);
      } catch (e) {
        send.disabled = false;
        status.textContent = "Couldn't send — please email ralphseanevans@gmail.com instead.";
      }
    } else {
      status.textContent = "Opening Gmail with your message ready to send… if it doesn't open, email ralphseanevans@gmail.com directly.";
      window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&to=ralphseanevans%40gmail.com&su=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body())}`,
        "_blank", "noopener"
      );
    }
  });
  return wrap;
}

function render() {
  const main = document.getElementById("results");
  main.textContent = "";
  _comboPlaced = false;
  ensureSharedSetBanner();   // shows/hides the "someone shared these with you" strip
  const today = new Date();
  const visible = state.events.filter(matchesFilters);

  if (!state.events.length) {
    // Status line already explains why (error) — or the file genuinely has no events.
    if (!document.getElementById("status-line").classList.contains("error"))
      setStatus("No events yet — check back soon.", false);
    return;
  }

  let shown = 0;
  if (state.view === "calendar") {
    renderCalendar(main, visible);
    // Calendar/Map return early, so the shared filter chips (quick-filters + Advanced
    // panel) never had their selected "filled" state synced here the way the timeline
    // path does at the end of render(). Sync it in these views too so a chosen chip
    // fills in and reads as active. (Fix 2026-07-19.)
    updateFilterUI();
    return;
  } else if (state.view === "map") {
    renderMap(main, visible);
    updateFilterUI();
    return;
  } else {
    const withNext = visible
      .map(d => ({ ...d, next: nextOccurrence(d.ev, today) }))
      .filter(d => d.next)
      .sort((a, b) => a.next - b.next);

    // Past events (elapsed one-time events, ended recurring series) are hidden by
    // default — see state.showPast. When shown, they render greyed-out (.is-past)
    // in their own trailing bucket/section, sorted most-recently-past first.
    const pastList = state.showPast
      ? visible
          .filter(d => isPastEvent(d, today))
          .map(d => ({ ...d, next: pastOccurrenceDate(d.ev) }))
          .filter(d => d.next)
          .sort((a, b) => b.next - a.next)
      : [];

    if (state.view === "grid") {
      const grid = document.createElement("div");
      grid.className = "cards";
      for (const d of withNext) { grid.appendChild(card(d, { showWhen: true })); shown++; }
      main.appendChild(grid);
      if (pastList.length) {
        const h = document.createElement("h2");
        h.className = "bucket-heading"; h.textContent = "Past";
        main.appendChild(h);
        const pastGrid = document.createElement("div");
        pastGrid.className = "cards";
        for (const d of pastList) { pastGrid.appendChild(card(d, { showWhen: true, isPast: true })); shown++; }
        main.appendChild(pastGrid);
      }
    } else if (state.view === "list") {
      const buckets = bucketize(withNext, today);
      if (pastList.length) buckets.push(["Past", pastList]);
      for (const [label, items] of buckets) {
        if (!items.length) continue;
        const isPast = label === "Past";
        const h = bucketHeadingEl(label);
        main.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "list-rows";
        for (const d of items) { ul.appendChild(listRow(d, isPast)); shown++; }
        main.appendChild(ul);
      }
    } else {
      const buckets = bucketize(withNext, today);
      if (pastList.length) buckets.push(["Past", pastList]);
      for (const [label, items] of buckets) {
        if (!items.length) continue;
        const isPast = label === "Past";
        const h = bucketHeadingEl(label);
        main.appendChild(h);
        const grid = document.createElement("div");
        grid.className = "cards";
        for (const d of items) { grid.appendChild(card(d, { showWhen: true, isPast })); shown++; }
        main.appendChild(grid);
      }
    }
  }

  // Count reads "[left] of [right] events shown" (Sean, 2026-07-14), made scope-aware for
  // the regional pivot (2026-07-17): RIGHT = total events in the CURRENT SCOPE (Southern by
  // default; everything while "Traveling?" is on) and the line hints how many more wait
  // behind the toggle. Past events stay out of both numbers unless "Show Past Events" is on.
  // Unselected solo-class categories are outside the visible universe (2026-07-18) —
  // they stay out of BOTH numbers and the nationwide hint, so the default view still
  // reads "N of N shown" instead of implying a hidden filter.
  const isVerifiedShown = d => state.showUnverified || !isUnverified(d.ev);
  const inScope = d => (state.showNational || isRegional(d.ev) || locScopeActive()) && isVerifiedShown(d);
  const notPast = d => state.showPast || !isPastEvent(d, today);
  const inUniverse = d => !soloOptedOut(d);
  const totalHosted = state.events.filter(d => inScope(d) && notPast(d) && inUniverse(d)).length;
  const moreNational = (state.showNational || locScopeActive()) ? 0 : state.events.filter(d => !isRegional(d.ev) && notPast(d) && inUniverse(d) && isVerifiedShown(d)).length;
  const hint = moreNational ? ` · ${moreNational} more nationwide — turn on “National events” to see them` : "";

  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.showPast
      ? "No events match these filters."
      : "No upcoming events match these filters. Try clearing a filter, turning on “Show Past Events” or “National events”, or open the Calendar to browse by month.";
    main.appendChild(empty);
    setStatus(`0 of ${totalHosted} events shown${hint}`, false);
  } else {
    const scopeWord = state.showNational ? "" : " Southern";
    setStatus(`${shown} of ${totalHosted}${scopeWord} event${totalHosted === 1 ? "" : "s"} shown${state.showPast ? " (including past)" : ""}${hint}`, false);
  }
  updateFilterUI();
}

function bucketize(items, today) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfWeek = new Date(t0); endOfWeek.setDate(t0.getDate() + (6 - t0.getDay()));           // Saturday
  const endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfWeek.getDate() + 7);
  const buckets = [["Today", []], ["This Week", []], ["Next Week", []], ["Later", []]];
  for (const d of items) {
    if (d.next.getTime() === t0.getTime()) buckets[0][1].push(d);
    else if (d.next <= endOfWeek) buckets[1][1].push(d);
    else if (d.next <= endOfNextWeek) buckets[2][1].push(d);
    else buckets[3][1].push(d);
  }
  return buckets;
}

/* ---------- UI wiring ---------- */
function setStatus(msg, isError) {
  const el = document.getElementById("status-line");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
}
function setView(view) {
  if (!["timeline", "calendar", "map"].includes(view)) view = "timeline";
  state.view = view;
  for (const b of document.querySelectorAll(".view-btn"))
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  savePrefs();
  render();
  renderActiveChips();
}
function savePrefs() {
  // 2026-07-17 redesign: filters/sel are NO LONGER persisted here — the URL query string
  // owns filter state (shareable links). Only true UI prefs remain.
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      view: state.view,
      filtersOpen: state.filtersOpen,
      showPast: state.showPast,
    }));
  } catch (e) { /* private mode etc. — prefs just won't persist */ }
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    if (["timeline", "schedule", "calendar", "map"].includes(p.view)) state.view = p.view === "schedule" ? "calendar" : p.view;
    else if (["grid", "list"].includes(p.view)) state.view = "timeline";
    // filtersOpen intentionally NOT restored (Sean, 2026-07-12) — panel starts collapsed.
    if (typeof p.showPast === "boolean") state.showPast = p.showPast;
  } catch (e) { /* ignore bad prefs */ }
}
function setFiltersOpen(open) {
  state.filtersOpen = open;
  const panel = document.getElementById("filter-panel");
  const toggle = document.getElementById("filters-toggle");
  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("sheet-open", open);   // mobile bottom-sheet scroll lock
  renderActiveChips();                                   // summary chips only show while closed
  savePrefs();
}
let filtersAttentionTimer = null;
function startFiltersAttention() {
  const toggle = document.getElementById("filters-toggle");
  if (!toggle) return;
  toggle.classList.add("attention-blink");
  clearTimeout(filtersAttentionTimer);
  filtersAttentionTimer = setTimeout(stopFiltersAttention, 6000);   // ~6s, then settle back to normal
}
function stopFiltersAttention() {
  clearTimeout(filtersAttentionTimer);
  document.getElementById("filters-toggle")?.classList.remove("attention-blink");
}

/* Brief blue/pink flash on the Submit button right on page load, then the
   Filters button picks up its own blue/yellow attention blink — a one-two
   sequence instead of both competing for attention at once. */
function startSubmitAttention() {
  const btn = document.querySelector(".submit-event-btn");
  if (!btn) return;
  btn.classList.add("attention-blink");
  setTimeout(() => btn.classList.remove("attention-blink"), 1000);   // ~1s, then settle back to normal
}

function init() {
  loadPrefs();
  applyUrl();   // URL query string wins over defaults (shareable filtered links, 2026-07-17)
  for (const b of document.querySelectorAll(".view-btn"))
    b.addEventListener("click", () => {
      setView(b.dataset.view);
      // Activity Pulse signal — only on an actual click, not the setView(state.view) restore below.
      window.dispatchEvent(new CustomEvent("activity-signal", { detail: { type: "view", view: b.dataset.view } }));
    });
  setView(state.view);
  document.getElementById("filters-toggle").addEventListener("click", () => {
    setFiltersOpen(!state.filtersOpen);
    stopFiltersAttention();
  });
  setFiltersOpen(state.filtersOpen);
  const pastToggle = document.getElementById("past-toggle");
  pastToggle.setAttribute("aria-pressed", String(state.showPast));
  pastToggle.addEventListener("click", () => {
    state.showPast = !state.showPast;
    pastToggle.setAttribute("aria-pressed", String(state.showPast));
    savePrefs();
    render();
  });
  // "Traveling? Show national events" — scope toggle; may arrive pre-set from a shared
  // ?travel=1 URL, so aria syncs from state here (2026-07-17 redesign).
  const travelToggle = document.getElementById("traveling-toggle");
  if (travelToggle) {
    travelToggle.setAttribute("aria-pressed", String(state.showNational));
    travelToggle.addEventListener("click", () => {
      state.showNational = !state.showNational;
      travelToggle.setAttribute("aria-pressed", String(state.showNational));
      render();
    });
  }
  // "Unverified" toggle — reveals events with research_confidence "low" (2026-07-20, Sean); may
  // arrive pre-set from a shared ?unverified=1 URL, so aria syncs from state here.
  const unverifiedToggle = document.getElementById("unverified-toggle");
  if (unverifiedToggle) {
    unverifiedToggle.setAttribute("aria-pressed", String(state.showUnverified));
    unverifiedToggle.addEventListener("click", () => {
      state.showUnverified = !state.showUnverified;
      unverifiedToggle.setAttribute("aria-pressed", String(state.showUnverified));
      render();
    });
  }
  // Event search (2026-07-20, Sean): one box that matches name / venue / city. Debounced so we
  // don't re-render on every keystroke; the ✕ button (and Clear all) reset it.
  const searchInput = document.getElementById("event-search");
  if (searchInput) {
    let searchTimer = null;
    const runSearch = () => {
      state.search = searchInput.value.trim().toLowerCase();
      const clearBtn = document.getElementById("event-search-clear");
      if (clearBtn) clearBtn.hidden = !state.search;
      render();
    };
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 140);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); runSearch(); }
      if (e.key === "Escape" && searchInput.value) { e.preventDefault(); searchInput.value = ""; clearTimeout(searchTimer); runSearch(); }
    });
    const searchClear = document.getElementById("event-search-clear");
    if (searchClear) searchClear.addEventListener("click", () => {
      searchInput.value = ""; clearTimeout(searchTimer); runSearch(); searchInput.focus();
    });
    const searchApply = document.getElementById("event-search-apply");
    if (searchApply) searchApply.addEventListener("click", () => { clearTimeout(searchTimer); runSearch(); });
  }
  // "Choose another location…" reveals the cascading dropdowns; back/forward re-applies
  // filters from the URL. Filters take effect immediately, so the panel needs no apply button.
  // The panel closes through the ✕, the dimmed mobile backdrop, or the Escape key.
  document.getElementById("filters-close")?.addEventListener("click", () => setFiltersOpen(false));
  document.getElementById("filter-backdrop")?.addEventListener("click", () => setFiltersOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.filtersOpen) setFiltersOpen(false);
  });
  const locMore = document.getElementById("loc-more");
  const toggleLocationSelects = () => {
    const box = document.getElementById("loc-selects");
    const open = box.hidden;
    box.hidden = !open;
    locMore.setAttribute("aria-expanded", String(open));
  };
  if (locMore) {
    locMore.addEventListener("click", toggleLocationSelects);
    locMore.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleLocationSelects();
    });
  }
  window.addEventListener("popstate", () => {
    for (const set of Object.values(state.filters)) set.clear();
    state.sel = { country: "", state: "", town: "" };
    state.showNational = false;
    state.showUnverified = false;
    applyUrl();
    document.getElementById("traveling-toggle")?.setAttribute("aria-pressed", String(state.showNational));
    document.getElementById("unverified-toggle")?.setAttribute("aria-pressed", String(state.showUnverified));
    document.getElementById("past-toggle")?.setAttribute("aria-pressed", String(state.showPast));
    buildLocSelects();
    render();
  });
  const soloToggle = document.getElementById("solo-styles-toggle");
  if (soloToggle) {
    soloToggle.addEventListener("click", () => {
      const open = soloToggle.getAttribute("aria-expanded") !== "true";
      soloToggle.setAttribute("aria-expanded", String(open));
      document.getElementById("solo-styles-chips").hidden = !open;
    });
  }
  startSubmitAttention();
  if (!state.filtersOpen) setTimeout(startFiltersAttention, 1000);   // starts right as the Submit flash finishes
  document.getElementById("reset-filters").addEventListener("click", clearAllFilters);
  ensureComboUI();   // "Share several" toggle + floating action bar (2026-07-17)
  // Tabs render only when there's more than one source (future WCS tab).
  const tabs = document.getElementById("source-tabs");
  if (SOURCES.length > 1) {
    tabs.hidden = false;
    for (const s of SOURCES) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = s.label;
      b.setAttribute("aria-selected", String(s.id === state.sourceId));
      b.addEventListener("click", () => {
        state.sourceId = s.id;
        for (const x of tabs.children) x.setAttribute("aria-selected", String(x === b));
        loadData();
      });
      tabs.appendChild(b);
    }
  }
  loadData();
}

document.addEventListener("DOMContentLoaded", init);

/* ---------- Calendar view (added 2026-07-11; replaces the old Schedule view) ----------
   Traditional month grid + 12-month year view. Events land on days derived STRICTLY
   from explicit schedule fields (day_of_week / monthly_rule / start_date / end_date) —
   never guessed. Auto-populates from dance_events.json like every other view. */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const cal = { year: null, month: null, mode: "month" };

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

/* Day-of-month numbers an event occurs on in a given month. */
function occurrencesInMonth(ev, y, m) {
  const out = [];
  const start = parseISO(ev.start_date), end = parseISO(ev.end_date);
  if (ev.type === "weekly_recurring") {
    const target = DAY_ORDER.indexOf(ev.day_of_week);
    if (target < 0) return out;
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      const dt = new Date(y, m, d);
      if (dt.getDay() !== target) continue;
      if (start && dt < start) continue;
      if (end && dt > end) continue;
      if (isExcludedOccurrence(ev, dt)) continue;
      out.push(d);
    }
    return out;
  }
  if (ev.type === "monthly_recurring") {
    const rule = monthlyRuleParts(ev.monthly_rule);
    const dateOfMonth = rule ? null : monthlyDateOfMonth(ev.monthly_rule);
    if (!rule && !dateOfMonth) return out;
    let dt;
    if (rule) {
      const first = new Date(y, m, 1);
      dt = new Date(y, m, 1 + ((rule.dow - first.getDay()) + 7) % 7 + (rule.nth - 1) * 7);
    } else {
      if (dateOfMonth > daysInMonth(y, m)) return out;   // e.g. no Feb 30th — no occurrence this month
      dt = new Date(y, m, dateOfMonth);
    }
    if (dt.getMonth() === m && (!start || dt >= start) && (!end || dt <= end)) out.push(dt.getDate());
    return out;
  }
  if (ev.type === "biweekly_recurring") {
    const target = DAY_ORDER.indexOf(ev.day_of_week);
    if (target < 0 || !start) return out;
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      const dt = new Date(y, m, d);
      if (dt.getDay() !== target) continue;
      if (dt < start) continue;
      if (end && dt > end) continue;
      const diffDays = Math.round((dt - start) / 86400000);
      if (((diffDays % 14) + 14) % 14 !== 0) continue;
      out.push(d);
    }
    return out;
  }
  if (!start) return out;
  const spanEnd = end || start;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const dt = new Date(y, m, d);
    if (dt >= start && dt <= spanEnd) out.push(d);
  }
  return out;
}

function hasDate(d) {
  return DAY_ORDER.includes(d.ev.day_of_week) || !!monthlyRuleParts(d.ev.monthly_rule) ||
    !!monthlyDateOfMonth(d.ev.monthly_rule) || !!parseISO(d.ev.start_date);
}

function renderCalendar(main, visible) {
  if (cal.year === null) { const now = new Date(); cal.year = now.getFullYear(); cal.month = now.getMonth(); }
  const wrap = document.createElement("section");
  wrap.className = "calendar";
  wrap.setAttribute("aria-label", "Event calendar");
  wrap.appendChild(calHeader());
  const dated = visible.filter(hasDate);
  wrap.appendChild(calLegend(dated));
  if (cal.mode === "year") renderYear(wrap, dated); else renderMonth(wrap, dated);
  const undated = visible.filter(d => !hasDate(d));
  if (undated.length) {
    const p = document.createElement("p");
    p.className = "cal-undated";
    p.textContent = "Date not yet announced: " + undated.map(d => d.ev.name).join(" · ");
    wrap.appendChild(p);
  }
  main.appendChild(wrap);
}

/* Color legend (Sean, 2026-07-17: "there needs to be a color legend for the calendar that
   makes sense"). Built from the categories actually visible this render — no dead entries —
   using the SAME colors as the day-cell chips and the Map markers (MAP_MARKER_COLORS is the
   single source of truth for category colors). Adds an "Unconfirmed date" swatch only when a
   tentative event is on screen. */
function calLegend(dated) {
  const box = document.createElement("div");
  box.className = "cal-legend";
  box.setAttribute("aria-label", "Calendar color legend");
  const order = Object.keys(MAP_MARKER_COLORS);
  const cats = [...new Set(dated.map(d => d.category || OTHER))]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const c of cats) {
    const item = document.createElement("span");
    item.className = "cal-legend-item";
    const sw = document.createElement("span");
    sw.className = "cal-legend-swatch";
    sw.style.background = MAP_MARKER_COLORS[c] || MAP_MARKER_COLORS.Other;
    item.appendChild(sw);
    item.append(c);
    box.appendChild(item);
  }
  if (dated.some(d => d.ev.type === "tentative")) {
    const item = document.createElement("span");
    item.className = "cal-legend-item";
    const sw = document.createElement("span");
    sw.className = "cal-legend-swatch cal-legend-swatch-tentative";
    item.appendChild(sw);
    item.append("Unconfirmed date");
    box.appendChild(item);
  }
  return box;
}
function calBtn(label, onClick, aria) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "cal-btn"; b.textContent = label;
  if (aria) b.setAttribute("aria-label", aria);
  b.addEventListener("click", onClick);
  return b;
}

function calHeader() {
  const h = document.createElement("div");
  h.className = "cal-header";
  const nav = document.createElement("div");
  nav.className = "cal-nav";
  const title = document.createElement("span");
  title.className = "cal-title";
  if (cal.mode === "month") {
    nav.appendChild(calBtn("«", () => { cal.year--; render(); }, "Previous year"));
    nav.appendChild(calBtn("‹", () => { cal.month--; if (cal.month < 0) { cal.month = 11; cal.year--; } render(); }, "Previous month"));
    title.textContent = `${MONTH_NAMES[cal.month]} ${cal.year}`;
    nav.appendChild(title);
    nav.appendChild(calBtn("›", () => { cal.month++; if (cal.month > 11) { cal.month = 0; cal.year++; } render(); }, "Next month"));
    nav.appendChild(calBtn("»", () => { cal.year++; render(); }, "Next year"));
  } else {
    nav.appendChild(calBtn("‹", () => { cal.year--; render(); }, "Previous year"));
    title.textContent = String(cal.year);
    nav.appendChild(title);
    nav.appendChild(calBtn("›", () => { cal.year++; render(); }, "Next year"));
  }
  const right = document.createElement("div");
  right.className = "cal-nav";
  right.appendChild(calBtn("Today", () => { const now = new Date(); cal.year = now.getFullYear(); cal.month = now.getMonth(); render(); }));
  const mBtn = calBtn("Month", () => { cal.mode = "month"; render(); });
  const yBtn = calBtn("Year", () => { cal.mode = "year"; render(); });
  mBtn.setAttribute("aria-pressed", String(cal.mode === "month"));
  yBtn.setAttribute("aria-pressed", String(cal.mode === "year"));
  right.appendChild(mBtn); right.appendChild(yBtn);
  h.appendChild(nav); h.appendChild(right);
  return h;
}

function monthEventMap(dated, y, m) {
  const byDay = new Map();
  for (const d of dated) {
    for (const day of occurrencesInMonth(d.ev, y, m)) {
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(d);
    }
  }
  return byDay;
}

function renderMonth(wrap, dated) {
  const y = cal.year, m = cal.month;
  const byDay = monthEventMap(dated, y, m);
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  for (const dow of DAY_ORDER) {
    const c = document.createElement("div");
    c.className = "cal-dow"; c.textContent = dow.slice(0, 3);
    grid.appendChild(c);
  }
  const lead = new Date(y, m, 1).getDay();
  for (let i = 0; i < lead; i++) {
    const c = document.createElement("div");
    c.className = "cal-cell empty";
    grid.appendChild(c);
  }
  const now = new Date();
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (d === now.getDate() && m === now.getMonth() && y === now.getFullYear()) cell.classList.add("today");
    const num = document.createElement("span");
    num.className = "day-num"; num.textContent = d;
    cell.appendChild(num);
    for (const item of (byDay.get(d) || [])) {
      const chip = document.createElement("button");
      chip.type = "button"; chip.className = "cal-chip";
      chip.dataset.cat = item.category || OTHER;
      if (item.ev.type === "tentative") chip.classList.add("tentative");
      chip.textContent = item.ev.name;
      chip.title = item.ev.name;
      const dt = new Date(y, m, d);
      chip.addEventListener("click", () => openEventPopup(item, dt));
      cell.appendChild(chip);
    }
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  const count = new Set([...byDay.values()].flat().map(i => i.ev.key || i.ev.name)).size;
  setStatus(count
    ? `${count} event${count === 1 ? "" : "s"} in ${MONTH_NAMES[m]} ${y}`
    : `No events in ${MONTH_NAMES[m]} ${y} match the current filters`, false);
}

function renderYear(wrap, dated) {
  const y = cal.year;
  const yearGrid = document.createElement("div");
  yearGrid.className = "cal-year";
  const yearKeys = new Set();
  const now = new Date();
  for (let m = 0; m < 12; m++) {
    const byDay = monthEventMap(dated, y, m);
    for (const items of byDay.values()) for (const i of items) yearKeys.add(i.ev.key || i.ev.name);
    const mini = document.createElement("button");
    mini.type = "button"; mini.className = "cal-mini";
    mini.setAttribute("aria-label", `Open ${MONTH_NAMES[m]} ${y}`);
    const h4 = document.createElement("h4"); h4.textContent = MONTH_NAMES[m];
    mini.appendChild(h4);
    const t = document.createElement("table");
    const thr = document.createElement("tr");
    for (const dow of DAY_ORDER) { const th = document.createElement("th"); th.textContent = dow[0]; thr.appendChild(th); }
    t.appendChild(thr);
    let tr = document.createElement("tr");
    const lead = new Date(y, m, 1).getDay();
    for (let i = 0; i < lead; i++) tr.appendChild(document.createElement("td"));
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      if ((lead + d - 1) % 7 === 0 && d !== 1) { t.appendChild(tr); tr = document.createElement("tr"); }
      const td = document.createElement("td"); td.textContent = d;
      if (byDay.has(d)) td.className = "has-events";
      if (d === now.getDate() && m === now.getMonth() && y === now.getFullYear()) td.classList.add("today");
      tr.appendChild(td);
    }
    t.appendChild(tr);
    mini.appendChild(t);
    mini.addEventListener("click", () => { cal.mode = "month"; cal.month = m; render(); });
    yearGrid.appendChild(mini);
  }
  wrap.appendChild(yearGrid);
  setStatus(yearKeys.size
    ? `${yearKeys.size} event${yearKeys.size === 1 ? "" : "s"} on the ${y} calendar`
    : `No events in ${y} match the current filters`, false);
}

/* ---------- Map view (added 2026-07-12) ----------
   Leaflet + free OpenStreetMap/CARTO tiles, no API key. Coordinates come from
   coordsFor() (cached exact matches, or an honest city-level fallback) — an
   event with no resolvable location at all is listed below the map, never
   given a fake pin. */
let mapInstance = null;
function renderMap(main, visible) {
  const wrap = document.createElement("section");
  wrap.setAttribute("aria-label", "Event map");
  if (typeof L === "undefined") {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "The map library didn't load (offline, or a network block). Try another view, or reload the page.";
    wrap.appendChild(p);
    main.appendChild(wrap);
    return;
  }
  const canvas = document.createElement("div");
  canvas.className = "map-canvas";
  canvas.id = "map-canvas";
  wrap.appendChild(canvas);
  const unlocated = document.createElement("p");
  unlocated.className = "cal-undated";
  main.appendChild(wrap);
  main.appendChild(unlocated);

  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  mapInstance = L.map(canvas, { scrollWheelZoom: false });
  L.tileLayer(MAP_TILE_URL, { attribution: MAP_TILE_ATTRIB, maxZoom: 19 }).addTo(mapInstance);

  const pins = [];
  const missing = [];
  for (const d of visible) {
    const coords = coordsFor(d);
    if (!coords) { missing.push(d.ev.name); continue; }
    pins.push({ d, coords });
  }

  if (!pins.length) {
    mapInstance.setView([30.5, -87.5], 8);   // Pensacola/Mobile region, no pins to fit
  } else {
    const bounds = [];
    for (const { d, coords } of pins) {
      const color = MAP_MARKER_COLORS[d.category] || MAP_MARKER_COLORS.Other;
      const marker = L.circleMarker([coords.lat, coords.lon], {
        radius: 9, color, weight: 2, fillColor: color, fillOpacity: 0.55,
      }).addTo(mapInstance);
      const popupEl = document.createElement("div");
      popupEl.className = "map-pin-popup";
      popupEl.appendChild(card(d, { showWhen: true }));
      marker.bindPopup(popupEl, { maxWidth: 280 });
      // Activity Pulse signal — selecting an event marker on the Map view.
      if (typeof d.ev.key === "string") {
        marker.on("popupopen", () => {
          window.dispatchEvent(new CustomEvent("activity-signal", { detail: { type: "event_viewed", eventId: d.ev.key } }));
        });
      }
      if (coords.precision === "city") marker.bindTooltip("Approximate location — exact address not available", { direction: "top" });
      bounds.push([coords.lat, coords.lon]);
    }
    if (bounds.length === 1) mapInstance.setView(bounds[0], 13);
    else mapInstance.fitBounds(bounds, { padding: [30, 30] });
  }

  if (missing.length) {
    unlocated.textContent = `No location to plot: ${missing.join(" · ")}`;
  }
  setStatus(`${pins.length} of ${visible.length} filtered event${visible.length === 1 ? "" : "s"} shown on the map`, false);
  setTimeout(() => mapInstance && mapInstance.invalidateSize(), 50);
}

/* Single-address popup opened by clicking a venue on any card (any view). */
let addressMapInstance = null;
function openAddressPopup(address, coords) {
  const backdrop = document.createElement("div");
  backdrop.className = "cal-pop-backdrop";
  const pop = document.createElement("div");
  pop.className = "cal-pop map-address-pop";
  pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
  const close = document.createElement("button");
  close.type = "button"; close.className = "pop-close"; close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  const title = document.createElement("p");
  title.className = "pop-date"; title.textContent = address;
  pop.appendChild(close); pop.appendChild(title);

  if (coords.precision === "city") {
    const note = document.createElement("p");
    note.className = "cal-undated";
    note.style.marginTop = "0";
    note.textContent = "Approximate location — the exact address isn't in our map data yet.";
    pop.appendChild(note);
  }

  const canvas = document.createElement("div");
  canvas.className = "map-canvas mini-map";
  pop.appendChild(canvas);
  backdrop.appendChild(pop);
  document.body.appendChild(backdrop);

  if (typeof L !== "undefined") {
    if (addressMapInstance) { addressMapInstance.remove(); addressMapInstance = null; }
    addressMapInstance = L.map(canvas, { scrollWheelZoom: false }).setView([coords.lat, coords.lon], 15);
    L.tileLayer(MAP_TILE_URL, { attribution: MAP_TILE_ATTRIB, maxZoom: 19 }).addTo(addressMapInstance);
    L.circleMarker([coords.lat, coords.lon], { radius: 9, color: "#4cc2ff", weight: 2, fillColor: "#4cc2ff", fillOpacity: 0.6 }).addTo(addressMapInstance);
    setTimeout(() => addressMapInstance && addressMapInstance.invalidateSize(), 50);
  } else {
    canvas.textContent = "Map unavailable right now.";
  }

  const done = () => {
    backdrop.remove();
    document.removeEventListener("keydown", esc);
    if (addressMapInstance) { addressMapInstance.remove(); addressMapInstance = null; }
  };
  const esc = (e) => { if (e.key === "Escape") done(); };
  close.addEventListener("click", done);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(); });
  document.addEventListener("keydown", esc);
  close.focus();
}

// Click-to-enlarge for card flyer/logo images (added 2026-07-12, Sean's request).
// Reuses the same backdrop/dialog/Escape pattern as the other popups above so it
// behaves consistently across every view that renders a card (Timeline, Grid, List,
// Calendar chip popup, Map venue card).
function openImageLightbox(src, label) {
  const backdrop = document.createElement("div");
  backdrop.className = "cal-pop-backdrop";
  const pop = document.createElement("div");
  pop.className = "lightbox-pop";
  pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
  pop.setAttribute("aria-label", label ? `Enlarged flyer for ${label}` : "Enlarged flyer");
  const close = document.createElement("button");
  close.type = "button"; close.className = "pop-close"; close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  const img = document.createElement("img");
  img.src = encodeURI(src);
  img.alt = label || "";
  pop.appendChild(close); pop.appendChild(img);
  backdrop.appendChild(pop);
  const done = () => { backdrop.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") done(); };
  close.addEventListener("click", done);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(); });
  document.addEventListener("keydown", esc);
  document.body.appendChild(backdrop);
  close.focus();
}

function openEventPopup(item, dt) {
  // Activity Pulse signal — opening an event via the Calendar view's day chip.
  if (item?.ev && typeof item.ev.key === "string") {
    window.dispatchEvent(new CustomEvent("activity-signal", { detail: { type: "event_viewed", eventId: item.ev.key } }));
  }
  const backdrop = document.createElement("div");
  backdrop.className = "cal-pop-backdrop";
  const pop = document.createElement("div");
  pop.className = "cal-pop";
  pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
  const close = document.createElement("button");
  close.type = "button"; close.className = "pop-close"; close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  const when = document.createElement("p");
  when.className = "pop-date";
  when.textContent = dt.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  pop.appendChild(close); pop.appendChild(when);
  pop.appendChild(card(item, { showWhen: false }));
  backdrop.appendChild(pop);
  const done = () => { backdrop.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") done(); };
  close.addEventListener("click", done);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(); });
  document.addEventListener("keydown", esc);
  document.body.appendChild(backdrop);
  close.focus();
}
