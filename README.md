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
