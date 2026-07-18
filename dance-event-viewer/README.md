# Dance Event Viewer

A community-facing page for browsing dance events across the Southern United States, reading live from
`../dance_events.json` (the master event list one folder up). No framework, no build
step, no dependencies — three files.

## Visual theme: Moonlit Ember + page-wide atmosphere (2026-07-16; club-light prototype 2026-07-18)

The site-wide palette and background atmosphere are defined in
**`css/moonlit-ember-theme.css`**, which is loaded last by `index.html` so it can
recolor the existing interface without changing its layout or behavior. The palette is
midnight (`#0b0c15`), raised midnight (`#151624`), warm ivory (`#f6eadf`), ember
(`#e8785b`), dusty rose (`#db8d85`), and muted mauve (`#a99ca5`). If another AI needs
to tune colors, that theme file is the source of truth; do not scatter new palette
overrides through the functional stylesheets.

### Theme switcher: 13 palettes (2026-07-17, expanded 2026-07-18)

A **color-theme dropdown** sits at the **top-left of the header** (mirroring the
top-right Submit button). It flips the whole site between 13 palettes by setting a
`data-theme` attribute on `<html>`; the choice is remembered in
`localStorage("dev-theme")`, and a tiny inline script in `<head>` applies the saved
theme before first paint so there's no flash of the wrong palette.

- **Moonlit Ember** is the default; **Classic Blue** preserves the original palette.
- The additional palettes are **Ennis Blade, CyberGum6, Ink-Crimson, Dead City,
  BloodMoon21, Hope Diamond, Neon Moon Tarot, Monster Paper, Technobike,
  Neon Darkness,** and **Crimson Gameboy**.

`css/moonlit-ember-theme.css` defines the palettes plus shared-effect tokens
(`--page-bg`, `--ash-*`, `--pulse-*`, `--whisper-*`) so the ash and background recolor
per theme; the menu wiring lives in **`js/theme-switch.js`**. Each theme also swaps the
**hero banner graphic** (handled in `theme-switch.js`): `assets/dance-event-viewer-banner.png`
(warm) for Ember, and `assets/dance-event-viewer-banner-classic.png` (the original
blue/pink banner, recovered from the initial-publish git commit) for Classic; the other
palettes retain the Ember banner. To add another theme, add its palette + tokens to
`moonlit-ember-theme.css`, its name to `VALID` in `theme-switch.js`, and an option button
in `index.html`.

### Folder-tab convention (2026-07-18)

The Timeline/Calendar/Map selector and the three **Submit an Event** intake
methods use the same physical-folder-tab pattern. Tabs stay in normal document flow;
the bordered panel begins directly beneath them. Every inactive tab has its own visible
background and complete border. The active tab shares the panel background and sets
its actual lower border color to that same panel background, so there must be **no
dividing line beneath the active tab**. Reassert that lower-border color after any later
hover or focus border rule; an inset pseudo-element does not conceal the border itself. Never
lift tabs with negative margins, negative positioning, or transforms. Keep every tab a
fixed height, preserve horizontal scrolling on narrow screens, and use theme variables
for all colors, focus rings, and shadows.

Grid and List were removed from the visible selector on 2026-07-18. Their space is
fully collapsed so Calendar and Map sit directly beside Timeline. Old saved
preferences for either retired view safely fall back to Timeline.

### Compact Location disclosure (2026-07-18)

The filter panel keeps Anywhere, Pensacola, Mobile, Elsewhere, and the link-styled
**Choose location** disclosure on the same row beside the Location label. State and
Town live in `#loc-selects` beneath `#loc-more`. The container must remain `hidden` and `display:none`
on initial load so it contributes zero height; opening it places both selects back in
normal flow and pushes Event Type downward. Closing it must not clear either selection.
Keep `aria-expanded` synchronized, preserve click/Enter/Space activation and the
focus-visible outline, and retain the explicit `.loc-selects[hidden]` rule—without it,
the container's normal `display:flex` rule overrides the browser's hidden styling.

### More-filters disclosure and separated panel (2026-07-18)

The advanced-filter disclosure is the final item at the bottom-left of the main quick-
filter card. It is a compact rectangular control—not a filter chip—and says
**Advanced**, with a funnel icon, optional `N active` badge, and a down chevron. Its
label remains concise while the chevron rotates to show the open state. On desktop, `#filter-panel` is
a sibling card separated from the quick-filter card by exactly 12px of page background;
on mobile it retains the fixed bottom-sheet behavior. Timeline deliberately suppresses
the redundant selected-filter summary row because the selected quick-filter buttons
already show their state; Calendar and Map retain the removable summary chips above the
disclosure. The disclosure remains the bottom-left action in the main card.

`index.html` contains one decorative element immediately inside `<body>`:
**`#site-ash-layer`**. Its particles are CSS-only, click-through, fixed behind the
interface, and disabled by `prefers-reduced-motion`. They do not use images, video,
network requests, or JavaScript. The existing hero/banner
(`assets/dance-event-viewer-banner.png`) is deliberately unchanged and the ash layer is
separate from it. No event loading, filters, views, map, whispers, ticker, or submission
functionality should be altered when maintaining this visual treatment.

The optional **club-light prototype** adds a second click-through background layer,
`#site-club-lights-layer`. Three low-opacity beams sweep slowly behind the interface;
`js/club-lights.js` places one soft color bloom at a time at randomized positions and
2.75-6.5 second intervals (20% less frequent than the initial cadence). Each bloom is
70% wider and taller than the first prototype and peaks at 0.195 opacity (raised 50%
after visual review). It reads the active palette's theme variables, pauses in a
hidden tab, avoids rapid strobing, and is disabled together with the ash when
`prefers-reduced-motion` is enabled. Its styles remain in `moonlit-ember-theme.css` so
the atmosphere stays separate from event loading, filters, views, and submissions.

The same script also injects a small theme-colored **low-poly panel creature**. At
random 9-17 second intervals it chooses a new horizontal position, rises from behind
the main controls panel, glances from side to side for 2.3-3.8 seconds, and ducks away.
Its approved low peek remains unchanged in open space; when the chosen position overlaps
the view tabs, it rises higher so the tabs do not hide its face. On phones, only this
over-tabs state gets an additional rise; the non-tab position keeps the approved low peek.
Its first appearance comes sooner for previewing. It is decorative and click-through,
pauses in hidden tabs, and is removed by the reduced-motion treatment.

Sean's **United States 250th anniversary artwork** is permanently centered in normal
flow immediately **above** the Dance Event Viewer banner. Its reviewed desktop size is
753×438px—exactly 75% larger than the prior 430×250 overlay—and it no longer overlaps
the banner or controls. On narrow screens it scales down to the available width. The
complete picture and all wording remain visible; the flag is
rendered as a separate crop of the supplied artwork and ripples continuously while the
wording stays stable below it with a crisp white outline around the letter shapes. The source asset is
`assets/usa-250-anniversary.png`; the page renders the background-free derivative
`assets/usa-250-anniversary-transparent.png`, preserving the flag's white stripes and
all lettering without a rectangular parchment field. Reduced-motion visitors keep the
complete artwork but see a still flag.

## Published copy (2026-07-11)

The site is LIVE at **https://danceeventviewer.net/dance-event-viewer/** — Sean's GoDaddy
domain as a GitHub Pages custom domain (repo `ralphseanevans/dance-event-viewer`, Sean's
account; a `CNAME` file at the repo root makes the domain work and must never be removed).
The old https://ralphseanevans.github.io/dance-event-viewer/ URLs auto-redirect. The repo mirrors this
folder's layout, with one deliberate difference: its `dance_events.json` is a
SANITIZED export — only the 15 fields the cards/recurrence engine need (`state` added
2026-07-17 for the regional pivot; `exclude_monthly_rules` added 2026-07-17 so a weekly
series can skip specific Nth-weekdays, e.g. SSO Lindy & Blues meets every Friday EXCEPT the
1st & 3rd — see `isExcludedOccurrence()` in `js/app.js`); internal pipeline fields are
stripped and must never be pushed. (Two former differences no longer apply: (a)
`dance-calendar.html` was decommissioned and removed entirely 2026-07-12, so it's just
gone, not merely kept off the repo; (b) the old claim that the published `index.html`
"drops `noindex` and adds the GoatCounter `rse-dance` snippet" was never actually true —
the repo copy carried `noindex` and had NO GoatCounter. Corrected 2026-07-14: `noindex`
was removed from BOTH copies so the site can be indexed by Google, and a meta description +
canonical link + root `robots.txt`/`sitemap.xml` were added; local and published
`index.html` are now identical apart from live-data. GoatCounter is still NOT installed —
if you want traffic analytics, the snippet still needs to be added.)
**This local copy stays the master** — the live site
updates via the "Publish the live site" step that now ends every WCS scan (sanitized
JSON + any new logos pushed to the repo; full procedure in `wcs-fbmessenger`'s SKILL.md,
token in `Daily Operating System/github-publish-token.txt`). See `CHANGELOG.md`
2026-07-11 in Daily Operating System for the full convention.

## How to run it

Browsers block pages opened as plain files (`file://...`) from reading local JSON, so
serve the folder with any tiny web server. Easiest:

1. **Double-click `serve.cmd` in this folder.** (Run the file itself — don't copy its
   text into a command window; the script needs to run as a file to find its folder.
   No administrator prompt needed.) It uses Python if installed, otherwise it falls
   back to `serve.ps1`, a tiny server that runs on Windows' built-in PowerShell — so
   nothing needs to be installed either way.
2. Leave the black window open (that's the server) and open
   **http://localhost:8000/dance-event-viewer/** in your browser.
3. Close the window (or Ctrl+C) to stop the server.

Every page load/refresh re-fetches `dance_events.json` with cache-busting — whatever is
in the file right now is what displays. Nothing event-related is cached or stored.

## What it shows (and what it never shows)

Cards render **only**: event name, style badge, schedule, next date, venue, cost, an
"Unconfirmed" badge for tentative entries, and — when the entry's `source_url` field
holds an explicit http(s) link — a "More info / register" button. Internal pipeline
fields in the JSON (notes, source names, ids, confirmation dates, calendar ids) are
deliberately never rendered — this page is safe to show or publish to the dance
community as-is.

**Location filtering (2026-07-11):** the Location row has quick chips (Pensacola area /
Mobile area / Elsewhere) — **Pensacola + Mobile are selected by default** — plus
Country/State/Town dropdowns built from what's actually in the data. All location info
is derived only from explicit text in the venue field; events whose venue doesn't name
a place fall under "Elsewhere / unlisted". Reset returns to the Pensacola+Mobile default.

## Listing corrections ("Wrong info?" widget, 2026-07-11; one-step flyer upload 2026-07-13)

Every card has a "Wrong info? Need to add info?" link that expands a small form
(what's wrong, a link to the correct info, an optional flyer photo, the sender's name —
hidden until clicked). Text-only corrections go out via the silent-send mail relay
(`SEND_ENDPOINT`), falling back to Gmail web compose if that's ever blank.

**One-step flyer upload (2026-07-13):** attaching a photo routes the send through the
Submission-Intake Apps Script (`SUBMIT_ENDPOINT`, `submission_kind:"correction"` +
`event_key` + `type`) — and that backend can now publish it to the live site with no
further steps: trusted senders (name contains "Ralph" or "admin123") get the image
committed straight to the GitHub repo (`graphics/logos/` + a `logo-map.json` update),
live in ~1–2 minutes; everyone else's upload is held and Sean gets an email with
one-click Approve/Reject links. Recurring events also get a prepended `patterns` entry
(key stem with date-ish suffixes stripped) so the flyer follows the series across
rolled-over keys. A photo-only send is valid — the description is only required when
there's no photo. Backend spec-of-record: `Daily Operating System/
Submission_AppsScript_Code.gs`; the daily `dos-flyer-sync` scheduled task pulls
web-published logos back into this local master folder (see `AUTOMATIONS.md`).

**Text corrections → hourly auto-fix (2026-07-13, same day):** text-only sends now
also go through the Submissions pipeline instead of the mail relay. Trusted senders
(name contains "Ralph"/"admin123") get queued as `pending-fix`; the hourly
`dos-correction-fixer` Cowork task interprets the note and applies it to the real
event data with the full safe-write/test/publish pipeline (never deletes events,
never changes keys — ambiguous asks are held for Sean). Everyone else's corrections
land in Sean's review queue, with an email either way.

**Submit an Event page — flyer handling (2026-07-18):** the "Upload a Flyer" intake
now accepts **multiple photos of the same flyer** (front/back, close-ups — up to 5,
8MB each / 20MB total) in one submission: the first photo is the one published as the
event's card image, all photos go to the Drive intake folder (extras in the sheet's
`extra_flyer_urls` column) and all are sent to Gemini together in one extraction call.
The "Fill Out Details" intake gained an **optional flyer image**: the typed details are
authoritative (no AI extraction), and a trusted sender name ("Ralph"/"admin123") puts
the event + flyer live immediately via the `web-events.json` overlay + logo layer,
while anyone else's is held — Sean's email Approve link publishes the **event and
flyer together** (not just the image). Backend spec-of-record:
`Daily Operating System/Submission_AppsScript_Code.gs`.

## Views & filters

- **Timeline** (default): events grouped by next occurrence — Today / This Week / Next Week / Later.
- **Grid**: flat cards sorted by next occurrence.
- **Calendar** (added 2026-07-11, replaces the old Schedule view): a traditional month
  grid — correct day counts incl. leap years, days under the right weekday, today
  highlighted. Events auto-populate as color-coded chips on their exact days, derived
  strictly from schedule fields (weekly on each matching weekday within bounds, monthly
  rules computed per month, one-time spans on every day of their range); clicking a chip
  opens the full card in a popup. Flip months with ‹ ›, jump years with « » , toggle a
  12-mini-month **Year** view (click any mini-month to zoom in), Today button returns
  home. Events with no resolvable date are listed under the grid as "Date not yet
  announced" rather than guessed onto a day. Saved "schedule" view prefs map to Calendar.
- Filters: Style, Day, Area (Pensacola/Mobile/Other), Recurring vs One-time — all
  combinable, with a reset button and live result count.
- Your view/filter choices persist between visits (browser localStorage — preferences
  only, never event data).

## Sharing — single event and "Share several" (multi-select, 2026-07-17)

Every card has a **share** button (⤴) that offers one dance via the native share sheet
(mobile) or clipboard, plus a **favorite** heart (this-browser only, localStorage).

**Share several** (Sean's request: "share multiple dances at one time… make it look good
together… (three dances all this weekend!) … without cluttering the chat"):

- The **✦ Share several** button (next to the view switcher) turns on *select mode*: each
  card shows a **+** toggle and the whole card becomes tappable to add/remove it. A floating
  bar tracks the count.
- **Share these** opens one combined post with a smart headline computed from the picked
  dances' next dates. A single window reads *"Three dances tonight!"* / *"Two dances this
  weekend!"*; a **split set gets a compound headline** — *"Three dances tonight & one
  tomorrow!"* (Sean's ask, 2026-07-17) — and three-or-more windows fall back to a clean
  *"Five dances coming up!"*. Today's dances say "tonight" (evening socials) unless they're
  all clearly daytime; a Saturday-tomorrow folds into "this weekend" when the set spans it.
  The headline is followed by a concise one-stanza-per-dance list (name · date/time · venue ·
  cost). Logic lives in `comboBucket` / `comboHeadline` in `js/app.js`.
- Three ways to send it, all from the preview modal: **Share/Copy** (native sheet or
  clipboard text), **Copy text**, and **Save image** (a gradient poster PNG rendered on a
  canvas — reads the live theme colors, so on mobile the whole weekend goes into a chat as
  ONE image via the native share sheet, or downloads on desktop).
- The shared link carries `?events=<key1>|<key2>|…`, so the recipient lands on **exactly**
  those dances (region/past gating bypassed) with a *"Someone shared N dances with you"*
  banner and a one-tap **See all events** escape to the full calendar.

All of this lives in `js/app.js` (search "Share several dances as one") and a self-contained
block at the end of `css/styles.css`; it is theme-var driven, so it matches whatever theme
is active. The entry button and floating bar are injected by JS (`ensureComboUI`), so the
feature adds nothing to `index.html` markup.

## Event logos (implemented 2026-07-11)

Per-event images are wired through **`logo-map.json`** in this folder: it maps an event's
`key` (from `dance_events.json`) to an image path, usually in `../graphics/logos/`. The
page loads the map fresh on every refresh; mapped events show the image at the top of
their card, unmapped events show nothing, and a missing/broken image is silently skipped.
The map is optional decoration — it can never affect event data.

- **To link a new logo:** drop the image in `graphics/logos/` and add one line to
  `logo-map.json` (`"event-key": "../graphics/logos/file.jpg"`). The same image may
  serve multiple events (the PSDS logo covers both monthly PSDS dances). Or just use
  the site itself: "Wrong info?" on the listing → attach photo → Send (2026-07-13
  one-step pipeline — see "Listing corrections" above). Web-uploaded files are named
  `upload-<key>-<id>.<ext>`; they land in the REPO first and reach this local master
  via the daily `dos-flyer-sync` task, so don't panic if the two are briefly out of
  sync. When publishing from local, MERGE `logo-map.json` with the repo copy rather
  than overwriting it — the repo may hold web uploads local doesn't have yet.
- **Logo continuity across scans (pattern matching, built 2026-07-11):** the scanner
  skills MERGE re-sightings into existing entries, so recurring events keep their `key`
  and their logo. For series that roll over to NEW keys (e.g. "West Coast Wednesdays in
  July" → August), the map's `patterns` section takes over: exact key matches win, then
  the first pattern whose `contains` substring appears in the key supplies the logo —
  so `west-coast-wednesdays-in-august-2026` inherits the TWYM logo automatically after
  a crawl, no edits needed. Ten patterns cover every current series.
- **Page logo/banner:** drop an `<img>` inside `<div id="brand-slot">` in `index.html`;
  put site-wide image files in `assets/`.
- All colors/spacing are CSS custom properties at the top of `css/styles.css`.

## Adding the WCS-only tab later

In `js/app.js`, add one entry to `SOURCES`:

    { id: "wcs", label: "West Coast Swing", file: "../wcs_events.json" }

Tabs appear automatically when more than one source is configured. (Note: `wcs_events.json`
entries have no `style` field — they'd all show under "Other" unless a default style is
set for that source. Ask Claude to wire that when the time comes.)

## Data rules this page follows

- `dance_events.json` is the sole source of truth — the page never invents, infers, or
  hard-codes event info, and omits any field that's missing rather than filling it in.
- Malformed/missing/empty data → a clear status message, never fabricated events.
- Tolerates a trailing-NUL "torn write" tail on the JSON (a known sync failure mode)
  but shows the error state if the file still won't parse.
