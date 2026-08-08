/* Choose-location state map (2026-08-03): renders a clickable US map inside the
 * "Choose location" reveal. Multi-select — click as many states as you like,
 * click again to deselect one — backed by state.mapStates (a Set, js/app.js).
 * Picking on the map hands location-scope precedence away from the State
 * dropdown (sel.state/sel.town); picking from the dropdown hands it back — the
 * two never both apply at once. The dropdown stays in place as the typing-
 * friendly / screen-reader-friendly single-pick fallback; the map is additive.
 * Hovering a state for a beat (or focusing it via keyboard) shows its name and
 * event count in a small tooltip near the pointer/shape.
 *
 * Data (js/us-states-map-data.js, ~145KB of SVG path data — 50 states + DC,
 * pre-projected Albers USA so Alaska/Hawaii already sit in their conventional
 * inset spot) is lazy-loaded the first time the panel opens, so a visitor who
 * never opens "Choose location" never downloads it. No external map API, no
 * fetch to anywhere but this site's own files.
 *
 * Depends on globals defined by js/app.js (loaded earlier in the page, same
 * global scope): `state` (shared filter state, including state.mapStates),
 * `US_STATES` (code -> full name), `buildLocSelects()`, `render()`. Guarded
 * below in case a future refactor changes how those are exposed.
 */
"use strict";
(function () {
  var DATA_SRC = "js/us-states-map-data.js?v=20260803a";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var loaded = false, loading = false;
  var mapHost = null, statusEl = null, svgEl = null;
  var tooltipEl = null, hoverTimer = null, lastMouseX = 0, lastMouseY = 0;
  var HOVER_DELAY = 700; // ms — "hover... if you hold it a sec"

  // City call-outs (2026-08-05, Sean's QI spec item 1: "Pensacola and Mobile should
  // have their own number"): the two home areas carry their own always-visible
  // counts, attributed by d.loc.area — the SAME attribution the area chips use
  // (DEFAULT_AREAS in js/app.js) — and the FL/AL state numbers EXCLUDE these
  // events, so no event is ever counted twice and punching states never changes
  // any displayed number. Anchors sit on Pensacola Bay / Mobile Bay in the map's
  // pre-projected Albers space; the labels themselves sit in open Gulf water
  // (positions checked against every state's path points) with a thin leader line
  // back to the anchor, because the two cities are ~13 map units apart — labels
  // placed on the land itself would collide with each other and the coastline.
  // Display-only by spec: not clickable, not in the tab order; the counts still
  // reach assistive tech via each call-out group's aria-label.
  var CITY_CALLOUTS = [
    { name: "Pensacola", area: "Pensacola area", anchor: [666.5, 488.5], label: [698, 540] },
    { name: "Mobile",    area: "Mobile area",    anchor: [653, 487],     label: [612, 548] }
  ];

  function appReady() {
    return typeof state === "object" && state && state.sel && state.mapStates
      && typeof US_STATES === "object"
      && typeof buildLocSelects === "function"
      && typeof render === "function";
  }

  function nameToCode(name) {
    for (var code in US_STATES) if (US_STATES[code] === name) return code;
    return null;
  }

  // Label-placement centroid (2026-08-03): a bounding-box center lands OUTSIDE the
  // landmass for concave/elongated shapes (Florida's peninsula, Louisiana's boot) and
  // in open water for multi-island states (Hawaii, Alaska, Michigan's two peninsulas).
  // Parse the path's rings directly, take the area-weighted (shoelace) centroid of
  // each, and use the LARGEST ring's centroid — puts the number on the main landmass
  // instead of a blended point between islands. Pure math on the path data already in
  // hand, so it works before the element is even in the document (no getBBox needed).
  function parseRings(d) {
    var rings = [], cur = null;
    var tokens = d.match(/[MLZ]|-?\d+\.?\d*/g) || [];
    var i = 0;
    while (i < tokens.length) {
      var t = tokens[i];
      if (t === "M") { cur = []; rings.push(cur); cur.push([+tokens[i + 1], +tokens[i + 2]]); i += 3; }
      else if (t === "L") { cur.push([+tokens[i + 1], +tokens[i + 2]]); i += 3; }
      else { i += 1; } // "Z"
    }
    return rings;
  }
  function ringCentroid(pts) {
    var a = 0, cx = 0, cy = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var p0 = pts[i], p1 = pts[(i + 1) % n];
      var cross = p0[0] * p1[1] - p1[0] * p0[1];
      a += cross; cx += (p0[0] + p1[0]) * cross; cy += (p0[1] + p1[1]) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-9) {
      var sx = 0, sy = 0;
      for (var j = 0; j < n; j++) { sx += pts[j][0]; sy += pts[j][1]; }
      return { area: 0, x: sx / (n || 1), y: sy / (n || 1) };
    }
    return { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
  }
  function ringBBox(pts) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return { w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
  }
  function labelPoint(d) {
    var rings = parseRings(d), best = null, bestRing = null;
    for (var i = 0; i < rings.length; i++) {
      if (rings[i].length < 3) continue;
      var c = ringCentroid(rings[i]);
      if (!best || c.area > best.area) { best = c; bestRing = rings[i]; }
    }
    if (!best) return null;
    var box = ringBBox(bestRing);
    best.minDim = Math.min(box.w, box.h);
    return best;
  }

  function ensureLoaded(cb) {
    if (loaded) { cb(); return; }
    if (loading) { document.addEventListener("dev-state-map-loaded", cb, { once: true }); return; }
    loading = true;
    var s = document.createElement("script");
    s.src = DATA_SRC;
    s.onload = function () {
      loading = false;
      if (!window.US_STATES_MAP) {
        if (statusEl) statusEl.textContent = "Map unavailable right now \u2014 use the State dropdown above.";
        return;
      }
      loaded = true;
      buildSvg();
      document.dispatchEvent(new Event("dev-state-map-loaded"));
      cb();
    };
    s.onerror = function () {
      loading = false;
      if (statusEl) statusEl.textContent = "Map unavailable right now \u2014 use the State dropdown above.";
    };
    document.head.appendChild(s);
  }

  // Events per state/city (2026-08-03: "put the number in the middle of each
  // state"; 2026-08-05: cities split out so Pensacola/Mobile carry their own
  // numbers and FL/AL exclude them; 2026-08-06, Sean: count CURRENT events).
  // Universe = the DEFAULT visible universe, matching what the area chips'
  // "(N)" facets show on a fresh visit: upcoming only (no past), verified only,
  // and solo-style classes excluded (they're opt-in). Still deliberately STATIC —
  // computed once from that fixed default universe, never from the live filter
  // state — so punching states or toggling filters can never change a map number.
  // Fail-quiet: if app.js's predicates aren't available (future refactor), fall
  // back to counting everything rather than breaking the map.
  function inDefaultUniverse(d, today) {
    try {
      if (typeof isPastEvent === "function" && isPastEvent(d, today)) return false;
      if (typeof isUnverified === "function" && isUnverified(d.ev)) return false;
      if (typeof SOLO_STYLES !== "undefined" && SOLO_STYLES.indexOf(d.category) !== -1) return false;
    } catch (e) { /* fall through — count it */ }
    return true;
  }
  function countsByCode() {
    var counts = { states: {}, cities: {} };
    CITY_CALLOUTS.forEach(function (c) { counts.cities[c.area] = 0; });
    if (!appReady() || !Array.isArray(state.events)) return counts;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    state.events.forEach(function (d) {
      var name = d && d.loc && d.loc.state;
      if (!name) return;
      var code = nameToCode(name);
      if (!code) return;
      if (!inDefaultUniverse(d, today)) return;
      var area = d.loc.area;
      if (area && Object.prototype.hasOwnProperty.call(counts.cities, area)) {
        counts.cities[area] += 1;
        return;
      }
      counts.states[code] = (counts.states[code] || 0) + 1;
    });
    return counts;
  }

  function ensureTooltip() {
    if (tooltipEl || !mapHost) return;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "state-tooltip";
    tooltipEl.setAttribute("role", "presentation"); // decorative echo of the shape's own aria-label, not separately announced
    mapHost.appendChild(tooltipEl);
  }
  function showTooltip(name, n, x, y) {
    if (!tooltipEl) return;
    tooltipEl.textContent = "";
    var nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    var countSpan = document.createElement("span");
    countSpan.className = "state-tooltip-count";
    countSpan.textContent = n === 1 ? "1 event" : n + " events";
    tooltipEl.appendChild(nameSpan);
    tooltipEl.appendChild(countSpan);
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top = (y - 14) + "px";
    tooltipEl.classList.add("is-visible");
  }
  function hideTooltip() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (tooltipEl) tooltipEl.classList.remove("is-visible");
  }

  function buildSvg() {
    if (!mapHost || !window.US_STATES_MAP) return;
    var data = window.US_STATES_MAP;
    var counts = countsByCode();
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", data.viewBox);
    svg.setAttribute("class", "loc-map-svg");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Choose a state on the map");
    data.states.forEach(function (st) {
      var n = counts.states[st.code] || 0;
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", st.d);
      p.setAttribute("class", "state-shape");
      p.setAttribute("data-code", st.code);
      p.setAttribute("data-name", st.name);
      p.setAttribute("role", "button");
      p.setAttribute("tabindex", "0");
      p.setAttribute("aria-label", st.name + (n ? ", " + n + (n === 1 ? " event" : " events") : ", no events yet"));
      p.setAttribute("aria-pressed", "false");
      p.addEventListener("click", function () { selectState(st.code, st.name); });
      p.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        selectState(st.code, st.name);
      });
      // Hover-hold tooltip (2026-08-03): only fires after HOVER_DELAY of the pointer
      // sitting still over a state, not on every pass-through while scanning the map.
      p.addEventListener("mouseenter", function (e) {
        lastMouseX = e.clientX; lastMouseY = e.clientY;
        hoverTimer = setTimeout(function () {
          var r = mapHost.getBoundingClientRect();
          showTooltip(st.name, n, lastMouseX - r.left, lastMouseY - r.top);
        }, HOVER_DELAY);
      });
      p.addEventListener("mousemove", function (e) { lastMouseX = e.clientX; lastMouseY = e.clientY; });
      p.addEventListener("mouseleave", hideTooltip);
      // Keyboard equivalent: show immediately next to the focused shape (no delay —
      // arriving via Tab is already a deliberate, discrete action, not a mouse pass-through).
      p.addEventListener("focus", function () {
        var rect = p.getBoundingClientRect();
        var r = mapHost.getBoundingClientRect();
        showTooltip(st.name, n, rect.left + rect.width / 2 - r.left, rect.top - r.top);
      });
      p.addEventListener("blur", hideTooltip);
      svg.appendChild(p);
    });
    mapHost.appendChild(svg);
    svgEl = svg;
    ensureTooltip();
    // Count labels — computed straight from each state's own path data (see
    // labelPoint above), not the rendered box, so peninsula/multi-island states
    // place the number on the actual landmass instead of open water. Scaled to
    // each state's own size (2026-08-03: "keep the small states small, like Rhode
    // Island and DC") — a fixed size dwarfed DC (~4 units across) entirely and
    // badly overflowed RI (~11 units); below LABEL_MIN_DIM there just isn't room
    // for a legible number at all, so it's skipped rather than drawn as a blob —
    // the tooltip and aria-label still carry the count for those states.
    var LABEL_MIN_DIM = 6, LABEL_MAX_FONT = 18, LABEL_MIN_FONT = 3.5, LABEL_SCALE = 0.35;
    data.states.forEach(function (st) {
      var pt = labelPoint(st.d);
      if (!pt) return;
      var fontSize = Math.min(LABEL_MAX_FONT, pt.minDim * LABEL_SCALE);
      if (pt.minDim < LABEL_MIN_DIM || fontSize < LABEL_MIN_FONT) return; // too little room for a legible number
      var n = counts.states[st.code] || 0;
      var label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", pt.x);
      label.setAttribute("y", pt.y);
      label.setAttribute("dy", "0.32em"); // vertical centering that doesn't depend on dominant-baseline support
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "state-count" + (n ? "" : " state-count-zero"));
      label.setAttribute("aria-hidden", "true"); // count is already folded into the path's aria-label above
      label.style.fontSize = fontSize.toFixed(1) + "px";
      label.style.strokeWidth = (fontSize * 0.27).toFixed(2) + "px"; // halo scales with the glyph, or it swallows small digits
      label.textContent = String(n);
      svg.appendChild(label);
    });
    // City call-outs (2026-08-05) — drawn after the state labels so they paint on
    // top. Each is: anchor dot on the bay, thin leader line, count, city name.
    // Same hover-hold tooltip contract as the states (immediate on nothing —
    // these aren't focusable, so there's no keyboard variant to mirror).
    CITY_CALLOUTS.forEach(function (c) {
      var n = counts.cities[c.area] || 0;
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "city-callout");
      g.setAttribute("role", "img");
      g.setAttribute("aria-label", c.name + ", " + n + (n === 1 ? " event" : " events"));
      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", c.anchor[0]);
      line.setAttribute("y1", c.anchor[1]);
      line.setAttribute("x2", c.label[0]);
      line.setAttribute("y2", c.label[1] - 12);
      line.setAttribute("class", "city-leader");
      g.appendChild(line);
      var dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", c.anchor[0]);
      dot.setAttribute("cy", c.anchor[1]);
      dot.setAttribute("r", "2.2");
      dot.setAttribute("class", "city-anchor");
      g.appendChild(dot);
      var num = document.createElementNS(SVG_NS, "text");
      num.setAttribute("x", c.label[0]);
      num.setAttribute("y", c.label[1]);
      num.setAttribute("text-anchor", "middle");
      num.setAttribute("class", "city-count-num" + (n ? "" : " state-count-zero"));
      num.textContent = String(n);
      g.appendChild(num);
      var nm = document.createElementNS(SVG_NS, "text");
      nm.setAttribute("x", c.label[0]);
      nm.setAttribute("y", c.label[1] + 10);
      nm.setAttribute("text-anchor", "middle");
      nm.setAttribute("class", "city-count-name");
      nm.textContent = c.name;
      g.appendChild(nm);
      // Hover tooltip, matching the states' hover-hold behavior and wording.
      g.addEventListener("mouseenter", function (e) {
        lastMouseX = e.clientX; lastMouseY = e.clientY;
        hoverTimer = setTimeout(function () {
          var r = mapHost.getBoundingClientRect();
          showTooltip(c.name, n, lastMouseX - r.left, lastMouseY - r.top);
        }, HOVER_DELAY);
      });
      g.addEventListener("mousemove", function (e) { lastMouseX = e.clientX; lastMouseY = e.clientY; });
      g.addEventListener("mouseleave", hideTooltip);
      svg.appendChild(g);
    });
    if (statusEl) statusEl.hidden = true;
    refreshHighlight();
  }

  // Discrete, addressable selection function + a matching DOM event — so a later
  // feature (e.g. zooming the existing Map view to the chosen state's venue-coords)
  // can hook in without touching this file. Multi-select (2026-08-03): each click
  // TOGGLES that state in/out of state.mapStates rather than replacing a single
  // value — pick as many as you like. Using the map at all hands it precedence
  // over the State dropdown (sel.state/sel.town cleared here); picking from the
  // dropdown instead hands precedence back (see the dropdown's own 'change'
  // listener in init() below) — the two never apply at the same time, so there's
  // no scenario where they contradict each other down to zero results.
  function selectState(code, name) {
    if (!appReady()) return;
    var wasSelected = state.mapStates.has(name);
    if (wasSelected) state.mapStates.delete(name); else state.mapStates.add(name);
    state.sel.state = "";
    state.sel.town = "";
    buildLocSelects();
    render();
    refreshHighlight();
    document.dispatchEvent(new CustomEvent("dev-state-selected", {
      detail: { code: code, name: name, selected: !wasSelected }
    }));
  }

  function refreshHighlight() {
    if (!svgEl || !appReady()) return;
    var shapes = svgEl.querySelectorAll(".state-shape");
    for (var i = 0; i < shapes.length; i++) {
      var p = shapes[i];
      var name = p.getAttribute("data-name");
      var isSel = state.mapStates.has(name) || (!!state.sel.state && state.sel.state === name);
      p.setAttribute("aria-pressed", isSel ? "true" : "false");
    }
  }

  function init() {
    if (!appReady()) return; // app.js not present/changed shape — fail quiet, dropdowns still work
    mapHost = document.getElementById("loc-map");
    statusEl = document.getElementById("loc-map-status");
    var locSelects = document.getElementById("loc-selects");
    if (!mapHost || !locSelects) return;
    // Watch the SAME hidden toggle app.js already drives on #loc-more, so this needs
    // no changes to app.js and works no matter how the panel gets opened (click,
    // keyboard, or any future entry point).
    var mo = new MutationObserver(function () {
      if (!locSelects.hidden) ensureLoaded(function () {});
    });
    mo.observe(locSelects, { attributes: true, attributeFilter: ["hidden"] });
    if (!locSelects.hidden) ensureLoaded(function () {}); // panel already open (e.g. shared/back-nav state)
    // Keep the map in sync when the visitor uses the dropdown directly. Deferred one tick:
    // app.js assigns sel.onchange lazily (inside buildLocSelects(), after data loads), so
    // depending on load timing it can end up registered AFTER this listener — without the
    // defer, refreshHighlight() could read state.sel.state before app.js's own handler has
    // updated it. setTimeout(…, 0) guarantees this runs after that handler either way.
    var selState = document.getElementById("sel-state");
    if (selState) {
      selState.addEventListener("change", function () {
        // A direct dropdown pick hands precedence back from any map multi-select —
        // matches selectState()'s own precedence rule in reverse.
        if (state.mapStates && state.mapStates.size) { state.mapStates.clear(); render(); }
        setTimeout(refreshHighlight, 0);
      });
    }
    // Reset (#reset-filters) clears state.mapStates itself (app.js's clearAllFilters()),
    // but nothing told the map's shapes to drop their visual selected look — deferred for
    // the same reason as the dropdown listener above (registration-order safety).
    var resetBtn = document.getElementById("reset-filters");
    if (resetBtn) resetBtn.addEventListener("click", function () { setTimeout(refreshHighlight, 0); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Small public hook, matching the window.DEV_ADD_TO_CAL convention already used
  // by js/add-to-calendar.js — lets a future feature reuse these without a rewrite.
  window.DEV_STATE_MAP = { selectState: selectState, refreshHighlight: refreshHighlight, nameToCode: nameToCode };
})();
