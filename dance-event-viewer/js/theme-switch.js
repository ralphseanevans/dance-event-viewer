/* Theme switcher — dropdown that applies one of the viewer's thirteen color palettes.
   Sets data-theme on <html>; CSS in styles.css + moonlit-ember-theme.css does the rest. Choice is remembered in
   localStorage("dev-theme"). A tiny inline script in <head> applies the saved theme before
   first paint (no flash); this file wires the menu and keeps its checkmarks in sync. */
(function () {
  "use strict";
  var STORE_KEY = "dev-theme";
  var VALID = {
    ember:true, classic:true, ennis:true, cybergum:true, crimson:true, deadcity:true,
    bloodmoon:true, hope:true, neonmoon:true, monster:true, technobike:true, baldur:true,
    crimson4:true, mintreactor:true
  };

  // Themes with their own artwork swap the hero banner to match the palette.
  // Every unlisted palette falls back to the warm Ember banner.
  var BANNERS = {
    ember: {
      src: "assets/dance-event-viewer-banner.png",
      alt: "Dance Event Viewer — a dancing couple under warm club lights"
    },
    classic: {
      src: "assets/dance-event-viewer-banner-classic.png",
      alt: "Dance Event Viewer — a dancing couple under blue and pink club lights"
    },
    mintreactor: {
      src: "assets/dance-event-viewer-banner-mint-reactor.png?v=20260804a",
      alt: "Dance Event Viewer — a dancing couple under mint and coral club lights"
    }
  };

  // Site-wide default (2026-08-03), set by the inline pre-paint script in index.html
  // and admin-configurable in dance-dashboard.html's "Site appearance" panel — falls
  // back to "ember" only if that script somehow didn't run (defensive, shouldn't happen).
  function defaultTheme() {
    return (window.DEV_SITE_DEFAULTS && window.DEV_SITE_DEFAULTS.theme) || "ember";
  }

  function saved() {
    return window.DEV_PREFS.oneOf(STORE_KEY, VALID, defaultTheme());
  }

  function apply(theme, persist) {
    if (!VALID[theme]) theme = defaultTheme();
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) window.DEV_PREFS.set(STORE_KEY, theme);
    // Only explicitly mapped themes load separate artwork. Every other palette retains
    // the current Moonlit Ember hero, so adding themes does not invent missing assets.
    var banner = BANNERS[theme] || BANNERS.ember;
    var img = document.getElementById("brand-img");
    if (img && banner) { img.setAttribute("src", banner.src); img.setAttribute("alt", banner.alt); }
    var opts = document.querySelectorAll(".theme-option");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-checked",
        opts[i].getAttribute("data-theme-value") === theme ? "true" : "false");
    }
  }

  function init() {
    var btn = document.getElementById("theme-switch-btn");
    var menu = document.getElementById("theme-menu");
    var header = btn ? btn.closest(".site-header") : null;
    if (!btn || !menu) return;

    apply(saved(), false); // sync menu checkmarks with the theme the head script already set

    function open() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      if (header) header.classList.add("theme-menu-open");
      document.addEventListener("click", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }
    function close() {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (header) header.classList.remove("theme-menu-open");
      document.removeEventListener("click", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    }
    function onDoc(e) {
      if (!menu.contains(e.target) && !btn.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === "Escape") { close(); btn.focus(); }
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    menu.addEventListener("click", function (e) {
      var opt = e.target.closest ? e.target.closest(".theme-option") : null;
      if (!opt) return;
      apply(opt.getAttribute("data-theme-value"), true);
      close();
      btn.focus();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
