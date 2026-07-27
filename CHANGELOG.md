# Changelog

## 2026-07-18 - Theme expansion and Dance Whispers removal

### Changed

- Expanded the header theme picker from 2 to 13 palettes.
- Kept the existing hero artwork and all event-viewer behavior unchanged.
- Added scroll containment to the theme menu for smaller screens.
- Lifted the header stacking context only while the theme menu is open, keeping the
  dropdown above the Timeline/Grid/List/Calendar/Map controls without permanently
  changing the page's layer order.
- Moved anonymous viewer-presence initialization into `activity-pulse.js` so it no
  longer depends on the removed chat feature.
- Renamed the shared Firebase configuration to `ACTIVITY_FIREBASE_CONFIG`.

### Removed

- Removed the Dance Whispers widget, script include, stylesheet include, and Firebase
  chat dependency.
- Deleted `dance-event-viewer/js/whispers.js` and
  `dance-event-viewer/css/whispers.css`.

### Verification

- Static integration suite: 58 checks passed.
- JavaScript syntax checks passed for `theme-switch.js` and `activity-pulse.js`.
- Live deployment exposes all 13 choices and persists the selected theme after reload.
- Live event rendering remained at 68 Southern event cards during release testing.
- Mobile check showed no horizontal overflow; the menu scrolls.
- Dance Whispers markup and assets were absent from the deployed page.

### Known issue

- Firebase currently returns `permission_denied` for writes under `/activity`. The
  Activity Pulse rail is present, but live pulse publishing requires a Firebase rules
  correction. This was observed during release testing and was not caused by removing
  Dance Whispers.
