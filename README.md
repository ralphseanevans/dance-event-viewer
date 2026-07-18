# Dance Event Viewer

Community viewer for partner-dance events (West Coast Swing and more) in the
Southern United States. Live site: see the GitHub Pages URL on this repo.

- `dance-event-viewer/` — the site (plain HTML/CSS/JS, no build step)
- `dance_events.json` — public event data (name, style, schedule, venue, cost only)
- `graphics/logos/` — event logos/flyers

The event data here is a sanitized export of a private master list; internal
pipeline fields are stripped before publishing. To update the live site,
replace `dance_events.json` (and any new logos) and commit.

Spot a wrong listing? Use the "Wrong info?" link on any event card.

## Appearance themes

The header theme picker offers 13 saved palettes without changing event data or viewer
behavior: Moonlit Ember, Classic Blue, Ennis Blade, CyberGum6, Ink-Crimson, Dead City,
BloodMoon21, Hope Diamond, Neon Moon Tarot, Monster Paper, Technobike, Neon Darkness,
and Crimson Gameboy. Palette definitions live in
`dance-event-viewer/css/moonlit-ember-theme.css`; menu behavior and persistence live in
`dance-event-viewer/js/theme-switch.js`.

## Realtime features

Dance Whispers was removed on 2026-07-18. Activity Pulse and the anonymous live viewer
count remain; both use the Firebase configuration in `dance-event-viewer/index.html` and
run through `dance-event-viewer/js/activity-pulse.js`.
