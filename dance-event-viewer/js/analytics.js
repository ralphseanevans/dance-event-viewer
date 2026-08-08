/* Site analytics (GA4) — 2026-08-07.
   Contains ONLY the public GA4 measurement ID (safe to publish; not a secret).
   Loads gtag.js and reports a small set of custom events by listening to the
   existing "activity-signal" bus, so app.js needs no changes. Loaded as a plain
   (non-defer) head script so the fetch wrapper below is installed before the
   deferred app.js issues its Supabase read. */
(function () {
  "use strict";
  if (window.__DEV_ANALYTICS_LOADED) return;
  window.__DEV_ANALYTICS_LOADED = true;

  var MEASUREMENT_ID = "G-HC9F04RL9D";

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (!window.gtag) window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID);

  function track(name, params) {
    try { gtag("event", name, params || {}); } catch (e) { /* never break the app */ }
  }

  /* App signals → GA events (bus already emitted by app.js for Activity Pulse). */
  window.addEventListener("activity-signal", function (e) {
    var d = e && e.detail;
    if (!d || !d.type) return;
    if (d.type === "view") {
      track("view_change", { view_name: String(d.view || "") });
    } else if (d.type === "event_viewed") {
      track("event_open", { event_key: String(d.eventId || "") });
    } else if (d.type === "filter") {
      track("filter_use", {
        filter_cats: String(d.cats || ""),
        filter_days: String(d.days || ""),
        filter_areas: String(d.areas || ""),
        filter_kinds: String(d.kinds || "")
      });
    } else if (d.type === "open_invite") {
      track("invite_open", {});
    }
  });

  /* Outbound clicks (event source links open organizer sites in a new tab). */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href^="http"]') : null;
    if (!a || !a.hostname || a.hostname === location.hostname) return;
    track("outbound_source", {
      link_domain: a.hostname,
      link_url: String(a.href).slice(0, 200)
    });
  }, true);

  /* Supabase read health: observe (never alter) fetch results so a fallback to
     the static JSON is visible in GA without touching app.js. */
  var origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var p = origFetch.apply(this, arguments);
      if (url.indexOf("supabase.co") !== -1 && url.indexOf("/rest/v1/") !== -1) {
        p.then(function (r) {
          if (r && !r.ok) track("supabase_fallback", { reason: "http_" + r.status });
        }, function () {
          track("supabase_fallback", { reason: "network_error" });
        });
      }
      return p;
    };
  }
})();
