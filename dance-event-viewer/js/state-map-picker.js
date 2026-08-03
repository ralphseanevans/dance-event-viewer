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

  // Total events per state (2026-08-03: "put the number in the middle of each
  // state"). Deliberately NOT filtered by the other active filters (style/day/
  // national toggle/etc.) — same "any event anywhere" universe the State select's
  // own option list already uses (see buildLocSelects), so the two agree.
  function countsByCode() {
    var counts = {};
    if (!appReady() || !Array.isArray(state.events)) return counts;
    state.events.forEach(function (d) {
      var name = d && d.loc && d.loc.state;
      if (!name) return;
      var code = nameToCode(name);
      if (!code) return;
      counts[code] = (counts[code] || 0) + 1;
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
      var n = counts[st.code] || 0;
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
      var n = counts[st.code] || 0;
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
