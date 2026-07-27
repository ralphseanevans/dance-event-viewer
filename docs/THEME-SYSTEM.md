# Theme system

Last verified: 2026-07-18

## What the visitor sees

The Theme button in the upper-left header opens a menu of 13 palettes. A selection is
applied to the complete viewer, saved in the browser, and restored before the page
paints on the next visit. Themes change colors and ambient effects only; they do not
change event data, filters, view modes, maps, sharing, or the hero artwork.

## Supported themes

| ID | Menu label |
| --- | --- |
| `ember` | Moonlit Ember |
| `classic` | Classic Blue |
| `ennis` | Ennis Blade |
| `cybergum` | CyberGum6 |
| `crimson` | Ink-Crimson |
| `deadcity` | Dead City |
| `bloodmoon` | BloodMoon21 |
| `hope` | Hope Diamond |
| `neonmoon` | Neon Moon Tarot |
| `monster` | Monster Paper |
| `technobike` | Technobike |
| `baldur` | Neon Darkness |
| `crimson4` | Crimson Gameboy |

## File ownership

- `dance-event-viewer/index.html` owns the pre-paint allowlist and menu labels.
- `dance-event-viewer/js/theme-switch.js` owns validation, selection, persistence,
  hero-source compatibility, and the temporary `theme-menu-open` header class.
- `dance-event-viewer/css/styles.css` owns menu layout, stacking, and swatches.
- `dance-event-viewer/css/moonlit-ember-theme.css` owns all palette variables and
  shared ambient effects.

When adding or renaming a theme, update all four places in the same change. Keep the ID
identical everywhere. Bump the CSS/JS cache query in `index.html` when publishing.

## Hero rule

Classic Blue keeps the classic banner; the other palettes reuse the current Moonlit
Ember hero. Do not add a palette-specific hero unless its optimized asset exists and
has been tested at desktop and mobile sizes.

## Dance Whispers removal

Dance Whispers was removed on 2026-07-18. Do not restore its markup or the deleted
`whispers.js` and `whispers.css` files accidentally. Activity Pulse and the anonymous
viewer count are separate features and remain in `activity-pulse.js`.

## Release checklist

1. Confirm every menu option maps to an allowed theme ID.
2. Confirm every ID has a CSS palette and swatch.
3. Switch a live theme and reload to verify persistence.
4. Confirm event cards and all view/filter controls still render.
5. Check phone-size layout for horizontal overflow and menu scrolling.
6. Confirm the dropdown paints above Timeline/Grid/List/Calendar/Map controls.
7. Confirm no Dance Whispers markup or asset reference has returned.
8. Check browser warnings. As of 2026-07-18, Firebase denies `/activity` writes; update
   Firebase rules before treating Activity Pulse as fully operational.
