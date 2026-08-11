/* Load the admin-selected site-wide page character before any character animation
   starts. The checked-in default remains available if the settings file is offline. */
(function () {
  "use strict";

  var VALID = { "panel-peeker": true, "hero-opossum": true, "blue-angels": true };
  var root = document.documentElement;
  var fallback = (window.DEV_SITE_DEFAULTS && window.DEV_SITE_DEFAULTS.pageCharacters) || ["hero-opossum"];

  function normalize(values) {
    if (!Array.isArray(values)) values = [];
    return values.filter(function (value, index) {
      return VALID[value] && values.indexOf(value) === index;
    });
  }

  function apply(values) {
    var choices = normalize(values);
    root.setAttribute("data-page-characters", choices.join(" "));
    root.removeAttribute("data-page-character-loading");
    window.dispatchEvent(new CustomEvent("dev-page-character-change", { detail: { values: choices } }));
    return choices;
  }

  window.DEV_PAGE_CHARACTER_READY = fetch("../site-settings.json?character=" + Date.now(), { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("site settings returned HTTP " + response.status);
      return response.json();
    })
    .then(function (settings) { return apply(settings && settings.page_characters); })
    .catch(function (err) {
      console.warn("Site settings unavailable; using the checked-in default page character.", err);
      return apply(fallback);
    });
})();
