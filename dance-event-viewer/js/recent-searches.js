/* Recent searches from everyone (2026-08-03, Sean's ask): a small shared list next
 * to the search box. Two halves:
 *   1) READ — fetch ../recent-searches.json (a plain static file, same pattern as
 *      dance_events.json / venue-coords.json) and render it. No auth needed to read.
 *   2) WRITE — when a visitor actually submits a search (Enter, or the search icon —
 *      NOT on every keystroke), POST the term to the Apps Script backend's
 *      log_search action so it can join the shared list for everyone else.
 * The write side needs a new Apps Script action that isn't deployed yet (see
 * STATUS.md) — until Sean redeploys, log attempts just no-op quietly and the list
 * only shows whatever ships in recent-searches.json. Reading never depends on that
 * deploy at all.
 *
 * References SUBMIT_ENDPOINT as a bare identifier — a top-level `const` in app.js,
 * loaded earlier on the page; same-realm classic scripts share that lexical scope.
 */
"use strict";
(function () {
  var LIST_SRC = "../recent-searches.json";
  var MAX_SHOWN = 8;
  var host = null, listEl = null;
  var lastLogged = ""; // avoid re-logging the exact same term back-to-back (e.g. Enter held, or apply-click right after typing-triggered search)

  function render(terms) {
    if (!host || !listEl) return;
    var clean = (Array.isArray(terms) ? terms : [])
      .filter(function (t) { return typeof t === "string" && t.trim(); })
      .slice(0, MAX_SHOWN);
    listEl.textContent = ""; // never innerHTML with data — matches the rest of the site
    if (!clean.length) { host.hidden = true; return; }
    clean.forEach(function (term) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recent-search-term";
      btn.textContent = term;
      btn.title = "Search for \u201c" + term + "\u201d";
      btn.addEventListener("click", function () { runTerm(term); });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
    host.hidden = false;
  }

  // Re-run a listed term the same way app.js's own search box does: set the value
  // and dispatch a real "input" event, so app.js's existing debounced handler picks
  // it up. No direct hook into app.js needed (its runSearch() is a private closure).
  function runTerm(term) {
    var input = document.getElementById("event-search");
    if (!input) return;
    input.value = term;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function loadList() {
    fetch(LIST_SRC, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("recent searches returned HTTP " + res.status);
        return res.json();
      })
      .then(function (data) { render(data && data.terms); })
      .catch(function (err) {
        // Stay hidden — not an error state visitors need to see, but the reason belongs in the console.
        console.warn("Shared recent searches could not be loaded.", err);
        render([]);
      });
  }

  // Optimistic local update: prepend right away so the visitor who just searched
  // sees their own term reflected immediately, without waiting on a re-fetch.
  function prependLocally(term) {
    if (!listEl) return;
    var current = Array.prototype.map.call(listEl.querySelectorAll(".recent-search-term"), function (b) { return b.textContent; });
    current = current.filter(function (t) { return t.toLowerCase() !== term.toLowerCase(); });
    current.unshift(term);
    render(current);
  }

  function logTerm(term) {
    term = String(term || "").trim();
    if (term.length < 2 || term.length > 60) return; // too short to be useful / defensively capped
    if (term.toLowerCase() === lastLogged.toLowerCase()) return;
    lastLogged = term;
    prependLocally(term);
    if (typeof SUBMIT_ENDPOINT !== "string" || !SUBMIT_ENDPOINT) return;
    fetch(SUBMIT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // matches the dashboard's simple-request pattern, avoids a CORS preflight
      body: JSON.stringify({ action: "log_search", term: term }),
    })
      // Backend not deployed yet, or offline — the optimistic local update already
      // covers this visitor, so only the console hears about it.
      .then(function (res) {
        if (!res.ok) console.warn("Search term was not logged (HTTP " + res.status + ").");
      })
      .catch(function (err) { console.warn("Search term could not be logged.", err); });
  }

  function init() {
    host = document.getElementById("recent-searches");
    listEl = document.getElementById("recent-searches-list");
    if (!host || !listEl) return;
    loadList();
    var input = document.getElementById("event-search");
    var applyBtn = document.getElementById("event-search-apply");
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && input.value.trim()) logTerm(input.value);
      });
    }
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        if (input && input.value.trim()) logTerm(input.value);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
