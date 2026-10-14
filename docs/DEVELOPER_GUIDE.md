# Developer guide

How the Dance Event Viewer works today and how to change it. Short on purpose; if
something here goes stale, fix it in the same PR as the change.

## How the data flows

- **Supabase is the source of truth.** Events live in `private.events` (project
  `xyyxbwetagfexsqtokpk`). Writes go only through authenticated dashboard, admin or
  scanner paths, never through the public key.
- A trigger (`private.sync_public_event_listing`) copies every active row to
  `public.event_listings` and removes rows whose `record_status` isn't `active`.
  The current definitions are in [`docs/sql/sync_public_event_listing.sql`](sql/sync_public_event_listing.sql).
- The site (`dance-event-viewer/js/app.js`) reads `public.event_listings` with the
  publishable key in `dance-event-viewer/js/supabase-config.js`.
- **`dance_events.json` is only a generated fallback**, used when Supabase can't be
  reached. Never edit it by hand and never treat it as the authority. Regenerate it
  with `tools/export_supabase_public.mjs`.
- `web-events.json` is a small overlay written by the submission Apps Script
  (`tools/apps-script/`). The main list wins on key.

## Rules

1. **All changes go through a branch and a pull request.** No direct pushes to `main`.
2. **Check the live site first.** When asked whether an event exists, or for its
   date, time, venue or cost, look at <https://danceeventviewer.net/dance-event-viewer/>
   and the live Supabase data before anything local. If the live data is down, say so
   instead of quietly using a possibly stale copy.
3. **Verify events against their own organizer.** The Pensacola Swing Dance Society
   (PSDS) schedule verifies **only PSDS events**. Check every other event against its
   own organizer, venue, flyer or event page.
4. **Nothing private in this repo.** It's public. No contact details, notes, tokens,
   service-role keys or personal paths. The publishable key and the GA measurement ID
   are meant to be public.
5. After an event edit in Supabase, confirm the public row with
   `node tools/verify_supabase_event.mjs <event-key>`.

## Event fields

The public listing has 18 fixed fields, plus the two cancel fields when they're set.

| Field | Meaning |
|---|---|
| `key` | Unique id (name + date, lowercase, hyphenated). Never change it once published. |
| `name` | Event name as the organizer gives it |
| `style` | Plain-language dance style (`West Coast Swing`, `Country Swing`, `Latin`, ...) |
| `type` | `weekly_recurring`, `monthly_recurring`, `one_time` or `tentative` |
| `day_of_week` | Used with `weekly_recurring` |
| `monthly_rule` | Used with `monthly_recurring`, e.g. `First Saturday` |
| `exclude_monthly_rules` | Optional list of "Nth Weekday" strings a weekly event does **not** meet, e.g. `["First Friday","Third Friday"]` |
| `exclude_dates` | Optional list of `YYYY-MM-DD` dates a recurring event does **not** meet. These dates are hidden. |
| `canceled_dates` | Optional list of `{ "date", "cancel_status", "reason" }`. The date still shows, with a cancel banner. See [cancel-banners.md](cancel-banners.md). |
| `cancel_status` | Whole-event cancellation: `confirmed`, `likely` or `owner`. Empty or null means not canceled. |
| `start_date` / `end_date` | `YYYY-MM-DD`, or null |
| `start_time` / `end_time` | 24-hour `HH:MM`, or null |
| `venue` | Name and/or address |
| `state` | 2-letter US state, or null |
| `cost` | Free text |
| `source_url` | Public organizer link, or null |
| `unverified` | Derived: true when research confidence is low |
| `verified_on` | Derived: date the listing was last confirmed |

Private-only fields (never published): `notes`, `source_skill`, `source_type`,
`source_detail`, `first_seen`, `last_confirmed`, `added_to_calendar`,
`calendar_event_id`, `research_batch`, `research_confidence`, and `in_wcs_list`
(true when the event belongs on the Panhandle WCS calendar; required on every row).

Use `exclude_dates` for "the series doesn't meet that day" and `canceled_dates` for
"it was going to happen and got called off". Don't use the dashboard's Cancel Event
button for a banner: it sets `record_status = 'cancelled'`, which removes the event.

## Tools

All run from the repo root with Node 20+. None of them write to Supabase.

| Command | What it does |
|---|---|
| `node --test tools/tests/` | Runs the tool tests (fixtures and mocked fetch, no network) |
| `node tools/export_supabase_public.mjs <out.json>` | Reads `public.event_listings` with the publishable key and writes the fallback JSON |
| `node tools/build_share_pages.mjs [--root .] [--out <dir>]` | Builds event pages, sitemap and the viewer's marked upcoming-links block, with cancel banners |
| `node tools/verify_supabase_event.mjs <key> [expected.json]` | Read-back check of one public row |
| `node tools/export_public.mjs <master.json> <out.json>` | Sanitizes a private master export into the public shape (leak check) |

Write to a temp dir first and review the diff before replacing committed files:

```sh
tmp=$(mktemp -d)
node tools/export_supabase_public.mjs "$tmp/dance_events.json"
diff <(jq -S . dance_events.json) <(jq -S . "$tmp/dance_events.json") | head
node tools/build_share_pages.mjs --out "$tmp"
```

The share-page builder keeps past pages as archives with a passed-event note and
upcoming links, but omits them from the sitemap. Sitemap `lastmod` comes only from
each event's `verified_on`; the viewer has none. `SHARE_PAGES_TODAY=YYYY-MM-DD`
pins the date for deterministic previews/tests. The viewer's static links are
rewritten only between `<!-- upcoming-events:start -->` / `<!-- upcoming-events:end -->`;
with `--out`, the updated `dance-event-viewer/index.html` also goes to that directory.
Event metadata uses conservative PostalAddress parsing and date-specific offsets
only for states in one time zone (AZ is fixed at -07:00); split-zone states omit offsets.

Other pieces: `dashboard-src/` is the source for the organizer dashboard
(`npm ci && npm run build` inside it). `tools/apps-script/` is a copy of the submission
Apps Script; its secrets live in Script Properties, not in the file.

## Sources we watch

Organizations and public sites only. Personal profiles and contact addresses are
kept out of this repo.

| Source | Kind |
|---|---|
| Let's Dance Pensacola | Facebook Page / letsdancepensacola.com |
| Pensacola Community WCS Chat | Facebook Messenger group |
| Dancing in Pensacola | Facebook Group |
| T L Dance | Facebook Page |
| Wild Greg's Saloon Pensacola | Facebook Page |
| The Pensacola Coastals Dance Studio | Facebook / own site |
| Pensacola Swing Dance Society | Newsletter and <https://pensacolaswingdancesociety.com> schedule (PSDS events only) |
| The Way You Move | Public Google Calendar |
| Time To Dance Gulf Coast | <https://time-to-dance-gulf-coast.mailchimpsites.com> |
| USA Dance community calendar | <https://usadance.org> |
| WSDC event list | <https://worldsdc.com/events/?country=USA> |
| Arthur Murray Dance-O-Rama | <https://www.arthurmurray.com/events/> |
| Fred Astaire national competitions | <https://www.fredastaire.com/events/> |
| Eventbrite (Ferry Pass dances) | <https://www.eventbrite.com/d/fl--ferry-pass/dances/> |

Notes:

- Skip bar, lounge, restaurant and legion-hall music nights that have no dance
  organizer, lesson or dance programming. A dance run by a club, society or studio
  stays in, even with a live band.
- Recap graphics posted in chats are not authoritative; confirm against the organizer.
- Two posts worded differently are often the same event. An exact
  `start_date`/`start_time` match is the strongest duplicate signal.
