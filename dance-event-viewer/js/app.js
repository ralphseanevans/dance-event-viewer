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
const CATEGORY_WHITELIST = ["West Coast Swing", "Mixed", "Latin", "Argentine Tango"];
const OTHER = "Other";
const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PREFS_KEY = "dance-event-viewer-prefs-v2";   // UI prefs only — never event data. (v2: location model changed 2026-07-11)
const DEFAULT_AREAS = ["Pensacola area", "Mobile area"];   // first-visit default per Sean
const LOGO_MAP_FILE = "logo-map.json";          // event key -> image path (optional; page works without it)
// Silent-send endpoint for the correction form: Sean's Google Apps Script web app /exec URL.
// While empty, the form falls back to opening Gmail compose. No credentials live in this page.
const SEND_ENDPOINT = "https://script.google.com/macros/s/AKfycbyTcNCMl42HCDosDST23_E2m_9vYLa6tKiCSIH8Y23G4KYrA5iL-efcbMyZVuGwFD3S/exec";

/* ---------- state ---------- */
const state = {
  sourceId: SOURCES[0].id,
  events: [],            // decorated events, rebuilt from JSON on every load
  view: "timeline",
  logos: {},             // from logo-map.json — purely decorative, optional
  logoPatterns: [],      // fallback substring rules so rolled-over series keep their logo
  filters: { cats: new Set(), days: new Set(), areas: new Set(DEFAULT_AREAS), kinds: new Set() },
  sel: { country: "", state: "", town: "" },   // "" = Any; derived from venue text only
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
  return (ev.type === "weekly_recurring" || ev.type === "monthly_recurring") ? "Recurring" : "One-time";
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
    if (!rule) return null;
    for (let k = 0; k < 3; k++) {
      const first = new Date(t0.getFullYear(), t0.getMonth() + k, 1);
      const d = new Date(first);
      d.setDate(1 + ((rule.dow - first.getDay()) + 7) % 7 + (rule.nth - 1) * 7);
      if (d >= t0 && (!end || d <= end) && (!start || d >= start)) return d;
    }
    return null;
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
    const rule = ev.monthly_rule.split("(")[0].trim();   // keep the public part of the rule text
    return tr ? `${rule} · ${tr}` : rule;
  }
  const start = parseISO(ev.start_date), end = parseISO(ev.end_date);
  if (start) {
    const ds = end && end.getTime() !== start.getTime() ? `${fmtDate(start)} – ${fmtDate(end)}` : fmtDate(start);
    return tr ? `${ds} · ${tr}` : ds;
  }
  return tr; // may be null — caller omits the line entirely
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

async function loadData() {
  const src = SOURCES.find(s => s.id === state.sourceId);
  setStatus("Loading events…", false);
  await loadLogoMap();
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
function buildFilterChips() {
  const groups = {
    cats: presentValues(d => d.category, [...CATEGORY_WHITELIST, OTHER]),
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
        set.has(v) ? set.delete(v) : set.add(v);
        syncChips(); render();
      });
      chip.dataset.value = v;
      holder.appendChild(chip);
    }
    holder.closest(".filter-group").hidden = values.length <= 1;
  }
  syncChips();
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
function matchesFilters(d) {
  const f = state.filters;
  if (f.cats.size && !f.cats.has(d.category)) return false;
  if (f.days.size && !f.days.has(d.day)) return false;
  if (f.areas.size && !f.areas.has(d.loc.area)) return false;
  for (const dim of ["country", "state", "town"])
    if (state.sel[dim] && d.loc[dim] !== state.sel[dim]) return false;
  if (f.kinds.size && !f.kinds.has(d.kind)) return false;
  return true;
}

/* ---------- rendering (whitelist only, textContent only) ---------- */
function card(d, { showWhen }) {
  const { ev } = d;
  const el = document.createElement("article");
  el.className = "card";

  const art = document.createElement("div");
  art.className = "card-art";
  const logoPath = logoFor(ev.key);
  if (typeof logoPath === "string" && logoPath) {
    const img = document.createElement("img");
    img.src = encodeURI(logoPath);
    img.alt = "";                                  // decorative — the name is in the heading
    img.loading = "lazy";
    img.addEventListener("error", () => art.remove());
    art.appendChild(img);
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
  if (badges.children.length) el.appendChild(badges);

  const h = document.createElement("h3");
  h.textContent = ev.name.trim();
  el.appendChild(h);

  if (showWhen && d.next) {
    const when = document.createElement("p");
    when.className = "when";
    const tr = timeRange(ev);
    when.textContent = tr ? `${fmtDate(d.next)} · ${tr}` : fmtDate(d.next);
    el.appendChild(when);
  }
  const sched = scheduleText(ev);
  if (sched) {
    const p = document.createElement("p");
    p.className = "schedule"; p.textContent = sched;
    el.appendChild(p);
  }
  if (typeof ev.venue === "string" && ev.venue.trim()) {
    const p = document.createElement("p");
    p.className = "venue"; p.textContent = ev.venue.trim();
    el.appendChild(p);
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
 