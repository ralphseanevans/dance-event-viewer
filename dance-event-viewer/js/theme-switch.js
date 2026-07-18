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
    crimson4:true
  };

  // Each theme also swaps the hero banner so the graphic matches the palette
  // (Sean, 2026-07-17): warm banner for Ember, the original blue/pink one for Classic.
  var BANNERS = {
    ember: {
      src: "assets/dance-event-viewer-banner.png",
      alt: "Dance Event Viewer — a dancing couple under warm club lights"
    },
    classic: {
      src: "assets/dance-event-viewer-banner-classic.png",
      alt: "Dance Event Viewer — a dancing couple under blue and pink club lights"
    }
  };

  function saved() {
    var t = null;
    try { t = localStorage.getItem(STORE_KEY); } catch (e) {}
    return VALID[t] ? t : "ember";
  }

  function apply(theme, persist) {
    if (!VALID[theme]) theme = "ember";
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) { try { localStorage.setItem(STORE_KEY, theme); } catch (e) {} }
    // Only Classic has a separate historical banner. Every other palette retains the
    // current Moonlit Ember hero, so adding themes does not invent or load missing assets.
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
    if (!btn || !menu) return;

    apply(saved(), false); // sync menu checkmarks with the theme the head script already set

    function open() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }
    function close() {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
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
