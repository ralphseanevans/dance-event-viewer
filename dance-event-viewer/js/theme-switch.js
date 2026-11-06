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
    var t = null;
    try { t = localStorage.getItem(STORE_KEY); } catch (e) {}
    return VALID[t] ? t : defaultTheme();
  }

  function apply(theme, persist) {
    if (!VALID[theme]) theme = defaultTheme();
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) { try { localStorage.setItem(STORE_KEY, theme); } catch (e) {} }
    // Only explicitly mapped themes load separate artwork. Every other palette retains
    // the current Moonlit Ember hero, so adding themes does not invent missing assets.
    // 2026-09-27: index.html's inline DEV_APPLY_BANNER loads only the active theme's WebP
    // banner (srcset); reuse it so a theme change fetches just that one image. BANNERS below
    // is kept only as a fallback if that inline helper is ever missing.
    if (typeof window.DEV_APPLY_BANNER === "function") {
      window.DEV_APPLY_BANNER(theme);
    } else {
      var banner = BANNERS[theme] || BANNERS.ember;
      var img = document.getElementById("brand-img");
      if (img && banner) { img.setAttribute("src", banner.src); img.setAttribute("alt", banner.alt); }
    }
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
    // ARIA menu keyboard pattern (2026-10-27): Up/Down move between options and wrap at the
    // ends, Home/End jump to the first/last. From the Theme button, Down/Up enter the menu.
    // Enter/Space select through the options' native button click; Escape closes.
    function items() { return Array.prototype.slice.call(menu.querySelectorAll(".theme-option")); }
    function onKey(e) {
      if (e.key === "Escape") { close(); btn.focus(); return; }
      var list = items();
      if (!list.length) return;
      var i = list.indexOf(document.activeElement);
      var next = -1;
      if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % list.length;
      else if (e.key === "ArrowUp") next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      if (next < 0 || (i < 0 && document.activeElement !== btn)) return;
      e.preventDefault();
      list[next].focus();
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
