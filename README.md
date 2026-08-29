# Dance Event Viewer

> **Current event storage (2026-08-16):** Supabase `private.events` is authoritative and synchronizes active rows to `public.event_listings`, which the viewer reads first. `dance_events.json` is generated from that public table for outage fallback and static recovery; never edit it as a source. Routine event changes do not require a GitHub publish.

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
source-obfuscated site log, event-key pages, and map-referenced logo set,
then commits, pushes without force, and verifies the live site.

The `e/` event pages were rebuilt 2026-08-07 (Sean-approved SEO overhaul): each is now a
full indexable landing page — self-canonical, schema.org Event JSON-LD, visible
name/schedule/venue/cost/flyer, related-event links, and a "Open the full calendar"
button — instead of an instant redirect. `build_share_pages.mjs` also regenerates the
repo-root `sitemap.xml` (viewer + all event pages); since 2026-08-08 the publisher stages
and commits it on every publish, refuses to run without `llms.txt` (the AI-search
discovery file at the repo root), and auto-rewrites css/js `?v=` cache-busters to content
hashes via `bump_cache_busters.mjs` when frontend changes are included — never hand-bump
a `?v=` suffix again. Analytics are GA4 (public measurement ID
`G-HC9F04RL9D`): `dance-event-viewer/js/analytics.js` on the viewer and submit form
(custom events ride the existing activity-signal bus; a `supabase_fallback` event
reports static-JSON fallback), inline tags on the root redirect and event pages. The
admin dashboard is deliberately untagged so admin visits don't pollute the data.

Temporary visual tests are not additional project checkouts. Create Git-free,
conspicuously marked copies only under
`%LOCALAPPDATA%\Temp\DanceEventViewer-VisualTests\` according to project-level
`AGENTS.md` rule 12. Never publish or preserve work from those copies; move any
work worth keeping into a deliberate branch-backed worktree instead.

Spot a wrong listing? Use the "Wrong info?" link on any event card.

## Secure dashboard

The public viewer stays plain HTML/CSS/JS. The new administrative client is separate:
`dashboard-src/` contains pinned Refine 5, React 18, Supabase, and Material UI 6 source;
`npm run typecheck` validates it and `npm run build` writes static output to
`dance-event-viewer/dashboard/`. Only the Supabase URL and publishable key ship to the browser.
`npm test` runs the Vitest unit suite in `dashboard-src/tests/` (jsdom; `npm run coverage`
adds a v8 coverage report). The suite covers the framework-free logic: data-quality findings,
event form/time/flyer formatting, and the auth and access-control providers with Supabase mocked.
Node 22.12+ is required — Vite 8's rolldown binding refuses to install on Node 20.

Supabase RLS is authoritative: inactive users see no event data, volunteers can read and edit
only actively assigned events, and the active owner admin manages all events, people,
assignments, activity, crawler runs, and source history. New sign-ins are inactive until approved.
The live dashboard supports Google and email-link sign-in, paginated event and source-history
records, complete recurring-event exclusions and WCS inclusion controls, and searchable volunteer-to-event
assignment linking. Linked Google accounts show their Google profile photo in the header; email-only
accounts retain the initial fallback. The owner-only Experimental Dashboard mirrors the public
viewer’s Timeline/Calendar/Map, search, filters, cards, spacing, and responsive rhythm while adding
a sticky desktop management panel and mobile tools drawer. It supports autosaving private event
drafts, separate preview/publish, occurrence-only cancellation, verified flyer changes through
event-scoped Supabase Storage, recommendation confirmation, owner/coach maintenance, and safeguarded
two-mode Event Series deletion. Existing experimental review modules remain below the manager;
Volunteer Admin authority remains separate.
Page modules are loaded on demand so the initial dashboard bundle stays lean.
See the project-root `Secure_Dashboard_Implementation_Plan_2026-08-08.md`.

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
