/* Shared localStorage access — Dance Event Viewer
 *
 * Every stored value here is a UI preference, never event data, and every read
 * and write is optional: private mode, a full quota, or a blocked origin throws,
 * and the site must carry on with its defaults. app.js and theme-switch.js each
 * repeated the same try/catch idiom around getItem/setItem for the theme, the
 * view prefs, the Dance Card style and layout, and the poster email; this is
 * that idiom in one place.
 */
(function (global) {
  "use strict";

  function get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  /* Stored value only when it is one of `valid`'s own keys, else `fallback` —
     for prefs whose vocabulary changed since the value was written. */
  function oneOf(key, valid, fallback) {
    var value = get(key);
    return (value && valid[value]) ? value : fallback;
  }

  function getJSON(key, fallback) {
    var raw = get(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function setJSON(key, value) {
    try { return set(key, JSON.stringify(value)); } catch (e) { return false; }
  }

  global.DEV_PREFS = { get: get, set: set, oneOf: oneOf, getJSON: getJSON, setJSON: setJSON };
})(window);
