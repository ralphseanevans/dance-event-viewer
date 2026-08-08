# Dance Event Viewer

Community viewer for partner-dance events (West Coast Swing and more) in the
Southern United States. Live site: https://danceeventviewer.net/dance-event-viewer/

- `dance-event-viewer/` — the site (plain HTML/CSS/JS, no build step)
- `dance_events.json` — public event data (name, style, schedule, venue, cost only)
- `graphics/logos/` — event logos/flyers

The event data here is a sanitized export of a private master list; internal
pipeline fields are stripped before publishing. The durable clone at
`C:\Users\sean\AI\Projects\DanceEventViewerProject\dance-event-viewer` is the sole
editable frontend and logo-map home. Its sibling `Dance Website` child under
`DanceEventViewerProject` is private input storage, not a second viewer.

Publishing is owned by the combined project's `Operations\Tools\publish_site.ps1`. It
defaults to a no-write dry run; `-Publish` builds the exact 18-field export,
source-obfuscated site log, event-key share pages, and map-referenced logo set,
then commits, pushes without force, and verifies the live site.

Temporary visual tests are not additional project checkouts. Create Git-free,
conspicuously marked copies only under
`%LOCALAPPDATA%\Temp\DanceEventViewer-VisualTests\` according to project-level
`AGENTS.md` rule 12. Never publish or preserve work from those copies; move any
work worth keeping into a deliberate branch-backed worktree instead.

Spot a wrong listing? Use the "Wrong info?" link on any event card.

## Appearance themes

The header theme picker offers 14 saved palettes without changing event data or viewer
behavior: Moonlit Ember, Classic Blue, Ennis Blade, CyberGum6, Ink-Crimson, Dead City,
BloodMoon21, Hope Diamond, Neon Moon Tarot, Monster Paper, Technobike, Neon Darkness,
Crimson Gameboy, and Mint Reactor (which also switches the site font to Martian Mono,
loaded lazily from Google Fonts only while that theme is active). Palette definitions live in
`dance-event-viewer/css/moonlit-ember-theme.css`; menu behavior and persistence live in
`dance-event-viewer/js/theme-switch.js`.

## Realtime features

Dance Whispers was removed on 2026-07-18. Activity Pulse and the anonymous live viewer
count remain; both use the Firebase configuration in `dance-event-viewer/index.html` and
run through `dance-event-viewer/js/activity-pulse.js`.

See `docs/THEME-SYSTEM.md` for theme IDs, file ownership, maintenance rules, and the
release checklist. Release history is recorded in `CHANGELOG.md`.
