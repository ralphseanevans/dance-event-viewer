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
// buildSoloStyleChips/#solo-styles-chips) rather than the flat partner-dance chip row, but they
// still write into the SAME state.filters.cats Set — a class is just a category like any other,
// only the UI grouping differs. Bachata is deliberately NOT here: it's an existing partner-dance
// entry already categorized "Latin" (sensual-sundays-bachata-pensacola-coastals) — leave it alone.
const SOLO_STYLES = ["Ballet", "Jazz", "Hip Hop", "Contemporary", "Heels", "Pom", "Musical Theatre", "Dance Fit"];
const CATEGORY_WHITELIST = [...CORE_CATEGORIES, ...SOLO_STYLES];
// National-org toggle buttons (2026-07-13 fix) — static HTML buttons (not built via makeChip)
// that behave as state.filters.cats tag members, same exclusive-narrowing behavior as any
// style chip. See isWSDC()/isUSADance()/isArthurMurray()/isFredAstaire() and matchesCat().
const NATIONAL_TAGS = [
  ["wsdc-toggle", "WSDC"],
  ["usadance-toggle", "USA Dance"],
  ["arthur-murray-toggle", "Arthur Murray"],
  ["fred-astaire-toggle", "Fred Astaire"],
];
const OTHER = "Other";
const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PREFS_KEY = "dance-event-viewer-prefs-v2";   // UI prefs only — never event data. (v2: location model changed 2026-07-11)
const DEFAULT_AREAS = [];   // default to All locations per Sean (2026-07-11: was Pensacola+Mobile only)
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
  logos: {},             // from logo-map.json — purely decorative, optional
  logoPatterns: [],      // fallback substring rules so rolled-over series keep their logo
  venueCoords: {},       // from venue-coords.json — exact-match venue -> {lat, lon}, decorative/optional
  cityFallbacks: {},     // from venue-coords.json — city name -> {lat, lon}, used when no exact match exists
  filters: { cats: new Set(), days: new Set(), areas: new Set(DEFAULT_AREAS), kinds: new Set() },
  sel: { country: "", state: "", town: "" },   // "" = Any; derived from venue text only
  filtersOpen: false,    // filter panel starts collapsed — only the view switcher shows until expanded
  showPast: false,       // hidden by default (2026-07-12, Sean) — the "of N" count and Timeline/Grid/List
                          // listings only count/show current events unless this is turned on.
  // WSDC / USA Dance / Arthur Murray / Fred Astaire (2026-07-13, Sean) — these used to be separate
  // booleans that only "unhid" events (and, per a 2026-07-13 diagnosis, never actually worked live
  // since they keyed off ev.source_detail, a field stripped from the published dance_events.json —
  // see isWSDC() etc. below). Rewired to be plain tag members of state.filters.cats, exactly like
  // every other style chip, so clicking one narrows the list to just that org, same as any style.
};

/* ---------- helpers: normalization (formatting-only, never invents data) ---------- */
function normCategory(style) {
  if (typeof style !== "string" || !style.trim()) return null;      // no category — never invent one
  const s = style.trim().toLowerCase();
  for (const c of CATEGORY_WHITELIST) if (c.toLowerCase() === s) return c;
  if (s === "unspecified") return OTHER;
  return OTHER;                                                     // genuine but unrecognized style
}
/* Location is derived ONLY from explicit text in the venue field — never guessed. */
function locationOf(venue) {
  const v = typeof venue === "string" ? venue : "";
  const loc = { area: "Elsewhere / unlisted", country: "Unlisted", state: "Unlisted", town: "Unlisted" };
  if (/pensacola/i.test(v)) Object.assign(loc, { area: "Pensacola area", country: "USA", state: "Florida", town: "Pensacola" });
  else if (/mobile/i.test(v)) Object.assign(loc, { area: "Mobile area", country: "USA", state: "Alabama", town: "Mobile" });
  else if (/panama city beach/i.test(v)) Object.assign(loc, { country: "USA", state: "Florida", town: "Panama City Beach" });
  else {
    const st = /,\s*(fl|florida)\b/i.test(v) ? "Florida" : /,\s*(al|alabama)\b/i.test(v) ? "Alabama" : null;
    if (st) Object.assign(loc, { country: "USA", state: st });
  }
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
   hidden from Timeline/Grid/List, shown under Calendar's "Date not yet announced"). */
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
  state.events = list
    .filter(ev => ev && typeof ev.name === "string" && ev.name.trim())
    .map(ev => ({
      ev,
      category: normCategory(ev.style),
      loc: locationOf(ev.venue),
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
function buildFilterChips() {
  const groups = {
    // "cats" only covers the core partner-dance categories here — Solo Dance Styles get their
    // own holder (buildSoloStyleChips) so they don't clutter the main Style row, even though
    // both groups toggle the same state.filters.cats Set underneath.
    cats: presentValues(d => d.category, [...CORE_CATEGORIES, OTHER]),
    days: presentValues(d => d.day, DAY_ORDER),
    areas: presentValues(d => d.loc.area, ["Pensacola area", "Mobile area", "Elsewhere / unlisted"]),
    kinds: presentValues(d => d.kind, ["Recurring", "One-time"]),
  };
  buildLocSelects();
  for (const [group, values] of Object.entries(groups)) {
    const holder = document.querySelector(`.chips[data-group="${group}"]`);
    holder.textContent = "";
    const all = makeChip(group === "cats" ? "All categories" : "All", () => {
      state.filters[group].clear();
      syncChips(); render();
    });
    all.dataset.all = "1";
    holder.appendChild(all);
    for (const v of values) {
      const chip = makeChip(v, () => {
        const set = state.filters[group];
        const wasSelected = set.has(v);
        wasSelected ? set.delete(v) : set.add(v);
        syncChips(); render();
        // Activity Pulse signal (Sean, 2026-07-13) — only on selecting a specific value,
        // not on deselecting or on the generic "All" chip. Sends a full snapshot of every
        // active filter dimension so the ticker can compose a combined sentence when more
        // than one is selected, not just the value that was just clicked.
        if (!wasSelected) {
          window.dispatchEvent(new CustomEvent("activity-signal", { detail: filterSnapshotDetail() }));
        }
      });
      chip.dataset.value = v;
      holder.appendChild(chip);
    }
    holder.closest(".filter-group").hidden = values.length <= 1;
  }
  buildSoloStyleChips();
  syncChips();
}
/* Solo Dance Styles — separate collapsed chip row under the Style group (see #solo-styles-chips
   / .solo-styles-toggle in index.html). Chips here toggle state.filters.cats, same as the main
   Style chips — the split is presentation-only, not a second filter dimension. */
function buildSoloStyleChips() {
  const holder = document.getElementById("solo-styles-chips");
  const wrap = document.querySelector(".solo-styles-group");
  if (!holder || !wrap) return;
  holder.textContent = "";
  const values = presentValues(d => d.category, SOLO_STYLES);
  for (const v of values) {
    const chip = makeChip(v, () => {
      const set = state.filters.cats;
      const wasSelected = set.has(v);
      wasSelected ? set.delete(v) : set.add(v);
      syncChips(); render();
      if (!wasSelected) {
        window.dispatchEvent(new CustomEvent("activity-signal", { detail: filterSnapshotDetail() }));
      }
    });
    chip.dataset.value = v;
    holder.appendChild(chip);
  }
  wrap.hidden = values.length === 0;
}
function makeChip(label, onClick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = label;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", onClick);
  return b;
}
function syncChips() {
  for (const [group, set] of Object.entries(state.filters)) {
    const holder = document.querySelector(`.chips[data-group="${group}"]`);
    for (const chip of holder.querySelectorAll(".chip")) {
      const on = chip.dataset.all ? set.size === 0 : set.has(chip.dataset.value);
      chip.setAttribute("aria-pressed", String(on));
    }
  }
  const soloHolder = document.getElementById("solo-styles-chips");
  if (soloHolder) {
    for (const chip of soloHolder.querySelectorAll(".chip"))
      chip.setAttribute("aria-pressed", String(state.filters.cats.has(chip.dataset.value)));
  }
  // National-org toggles (WSDC / USA Dance / Arthur Murray / Fred Astaire, 2026-07-13) — same
  // idea as the solo-style chips above: they're plain state.filters.cats members but live
  // outside the .chips[data-group="cats"] container, so they need their own aria-pressed sync.
  for (const [id, tag] of NATIONAL_TAGS) {
    document.getElementById(id)?.setAttribute("aria-pressed", String(state.filters.cats.has(tag)));
  }
  savePrefs();
}
function buildLocSelects() {
  const dims = { country: "sel-country", state: "sel-state", town: "sel-town" };
  for (const [dim, id] of Object.entries(dims)) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const values = [...new Set(state.events.map(d => d.loc[dim]).filter(v => v && v !== "Unlisted"))].sort();
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
    sel.onchange = () => { state.sel[dim] = sel.value; savePrefs(); render(); };
  }
}
/* WSDC (World Swing Dance Council) registry events — national/international conventions,
   sourced from worldsdc.com/events. Matched primarily by the "wsdc-" key prefix every event
   from that crawl was given (2026-07-13 fix: the live site's dance_events.json is the sanitized
   13-field export — see wcs-fbmessenger SKILL.md's publish step — which never includes
   source_detail, so a source_detail-only check always returned false in production, silently
   no-opping this whole filter. key survives sanitization, so check it first; source_detail is
   kept as a fallback for local/unsanitized data.) */
function isWSDC(ev) {
  return (typeof ev.key === "string" && ev.key.startsWith("wsdc-")) ||
    (typeof ev.source_detail === "string" && /wsdc/i.test(ev.source_detail));
}
/* USA Dance nationwide chapter/social events — sourced from usadance.org/events.
   Same key-prefix-first fix as isWSDC() above. */
function isUSADance(ev) {
  return (typeof ev.key === "string" && ev.key.startsWith("usa-dance-")) ||
    (typeof ev.source_detail === "string" && /usa dance/i.test(ev.source_detail));
}
/* Arthur Murray national "Dance-O-Rama" events — sourced from arthurmurray.com/events.
   Same key-prefix-first fix as isWSDC() above. */
function isArthurMurray(ev) {
  return (typeof ev.key === "string" && ev.key.startsWith("arthur-murray-")) ||
    (typeof ev.source_detail === "string" && /arthur murray/i.test(ev.source_detail));
}
/* Fred Astaire national competitions — sourced from fredastaire.com/events.
   Same key-prefix-first fix as isWSDC() above. */
function isFredAstaire(ev) {
  return (typeof ev.key === "string" && ev.key.startsWith("fred-astaire-")) ||
    (typeof ev.source_detail === "string" && /fred astaire/i.test(ev.source_detail));
}
/* Resolves a cats-Set tag to a match against an event. Real style categories (West Coast
   Swing, Latin, Ballet, ...) compare against d.category as before; the four national-org
   tags (added 2026-07-13) compare against the isX() detectors above instead, since an event's
   org affiliation is independent of its dance-style category. */
function matchesCat(d, tag) {
  switch (tag) {
    case "WSDC": return isWSDC(d.ev);
    case "USA Dance": return isUSADance(d.ev);
    case "Arthur Murray": return isArthurMurray(d.ev);
    case "Fred Astaire": return isFredAstaire(d.ev);
    default: return d.category === tag;
  }
}
function matchesFilters(d) {
  const f = state.filters;
  if (f.cats.size && ![...f.cats].some(tag => matchesCat(d, tag))) return false;
  if (f.days.size && !f.days.has(d.day)) return false;
  if (f.areas.size && !f.areas.has(d.loc.area)) return false;
  for (const dim of ["country", "state", "town"])
    if (state.sel[dim] && d.loc[dim] !== state.sel[dim]) return false;
  if (f.kinds.size && !f.kinds.has(d.kind)) return false;
  return true;
}

/* ---------- share (added 2026-07-13, Sean: "share and favorite buttons") ----------
   Native share sheet where available (mobile Safari/Chrome); clipboard copy everywhere
   else. The site has no per-event deep links, so the shared text carries the event's
   own details (name, schedule, venue) plus a link to the calendar itself — the
   recipient gets the info even though the URL always points at the homepage. */
function shareTextFor(ev) {
  const parts = [ev.name.trim()];
  const sched = scheduleText(ev);
  if (sched) parts.push(sched);
  if (typeof ev.venue === "string" && ev.venue.trim()) parts.push(ev.venue.trim());
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
  const url = location.origin + location.pathname;
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

  return wrap;
}

/* ---------- rendering (whitelist only, textContent only) ---------- */
function card(d, { showWhen, isPast }) {
  const { ev } = d;
  const el = document.createElement("article");
  el.className = "card";
  if (isPast) el.classList.add("is-past");
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
    return;
  } else if (state.view === "map") {
    renderMap(main, visible);
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
        const h = document.createElement("h2");
        h.className = "bucket-heading"; h.textContent = label;
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
        const h = document.createElement("h2");
        h.className = "bucket-heading"; h.textContent = label;
        main.appendChild(h);
        const grid = document.createElement("div");
        grid.className = "cards";
        for (const d of items) { grid.appendChild(card(d, { showWhen: true, isPast })); shown++; }
        main.appendChild(grid);
      }
    }
  }

  // The "of N" total excludes past events by default (Sean, 2026-07-12) — otherwise
  // it balloons with stale one-time events over time and stops meaning anything.
  // Also excludes WSDC/USA Dance/Arthur Murray/Fred Astaire events by default, same
  // reasoning as the past-event exclusion (2026-07-13: each is now gated by whether its
  // tag is selected in state.filters.cats, same source of truth the chips themselves use,
  // rather than a separate boolean that could drift out of sync).
  const countable = state.events.filter(d =>
    (state.filters.cats.has("WSDC") || !isWSDC(d.ev)) &&
    (state.filters.cats.has("USA Dance") || !isUSADance(d.ev)) &&
    (state.filters.cats.has("Arthur Murray") || !isArthurMurray(d.ev)) &&
    (state.filters.cats.has("Fred Astaire") || !isFredAstaire(d.ev))
  );
  const totalForCount = state.showPast
    ? countable.length
    : countable.filter(d => !isPastEvent(d, today)).length;

  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.showPast
      ? "No events match these filters."
      : "No upcoming events match these filters. Try clearing a filter, turning on “Show Past Events,” or open the Calendar to browse by month.";
    main.appendChild(empty);
    setStatus(`0 of ${totalForCount} events shown`, false);
  } else {
    setStatus(`${shown} of ${totalForCount} event${totalForCount === 1 ? "" : "s"} shown${state.showPast ? " (including past)" : ""}`, false);
  }
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
  state.view = view;
  for (const b of document.querySelectorAll(".view-btn"))
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  savePrefs();
  render();
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      view: state.view,
      filters: Object.fromEntries(Object.entries(state.filters).map(([k, v]) => [k, [...v]])),
      sel: state.sel,
      filtersOpen: state.filtersOpen,
      showPast: state.showPast,
    }));
  } catch (e) { /* private mode etc. — prefs just won't persist */ }
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    if (["timeline", "grid", "list", "schedule", "calendar", "map"].includes(p.view)) state.view = p.view === "schedule" ? "calendar" : p.view;
    for (const k of Object.keys(state.filters))
      if (Array.isArray(p.filters?.[k])) state.filters[k] = new Set(p.filters[k]);
    for (const dim of ["country", "state", "town"])
      if (typeof p.sel?.[dim] === "string") state.sel[dim] = p.sel[dim];
    // filtersOpen is intentionally NOT restored from prefs (Sean, 2026-07-12) — the filter panel
    // always starts collapsed on page load, even if a visitor left it open last time. Still saved
    // in savePrefs() (harmless / no longer read back) rather than ripping out the field entirely.
    if (typeof p.showPast === "boolean") state.showPast = p.showPast;
  } catch (e) { /* ignore bad prefs */ }
}
function setFiltersOpen(open) {
  state.filtersOpen = open;
  const panel = document.getElementById("filter-panel");
  const toggle = document.getElementById("filters-toggle");
  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
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
  // National-org toggles (WSDC / USA Dance / Arthur Murray / Fred Astaire) — 2026-07-13 fix:
  // wired exactly like a makeChip() chip (add/remove a tag in state.filters.cats), so clicking
  // one narrows the list to just that org, same as any real style chip. aria-pressed for these
  // is kept in sync by syncChips() (see NATIONAL_TAGS loop there), not set here.
  for (const [id, tag] of NATIONAL_TAGS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.addEventListener("click", () => {
      const set = state.filters.cats;
      const wasSelected = set.has(tag);
      wasSelected ? set.delete(tag) : set.add(tag);
      syncChips(); render();
      if (!wasSelected) window.dispatchEvent(new CustomEvent("activity-signal", { detail: filterSnapshotDetail() }));
    });
  }
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
  document.getElementById("reset-filters").addEventListener("click", () => {
    for (const set of Object.values(state.filters)) set.clear();
    state.filters.areas = new Set(DEFAULT_AREAS);                 // reset = back to defaults
    state.sel = { country: "", state: "", town: "" };
    for (const id of ["sel-country", "sel-state", "sel-town"]) {
      const s = document.getElementById(id);
      if (s) s.value = "";
    }
    // The 4 national-org toggles are now plain state.filters.cats members (2026-07-13 fix),
    // so the generic set.clear() loop above already resets them — no special-case needed.
    syncChips(); render();
  });
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
