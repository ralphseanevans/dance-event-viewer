# Changelog

## 2026-10-22 - Submissions: admin Google sign-in, RLS review list, no name trust

### Security

- A typed contact name (the old `TRUSTED_NAME_RE` / `TRUSTED_NAME_PATTERN`) no longer grants
  instant publishing. Trust now comes from Supabase: only an admin on the private user-id
  allowlist can file an `approved` submission, and the Apps Script consumes that row once,
  with the caller's token, only if the payload hash it computes matches the row.
- Submissions are filed through `rpc/submit_submission` (server-made id, no direct insert,
  idempotent `client_key` for retries) with a per-caller and global throttle on anon rows.
- The Supabase step gives up after 4 seconds, so the form never sticks on "Sending…".
- The throttle's per-sender hint uses only `cf-connecting-ip` (no `x-forwarded-for`; without
  it only the global limit applies); all submission helpers
  live in a new `submissions_private` schema (the existing `private` schema is untouched);
  the Apps Script checks trust only after the contact and image-type validations.

### Added

- `public.submissions` review list (proposed migration
  `supabase/migrations/20261022000000_submissions_rls.sql`, not applied), `js/submissions.js`,
  an admin-only review list on the Submit page, and `SETUP.md` (external settings).

### Changed

- "Sign in with Google" is now an optional **Admin sign-in** and redirects to
  `window.location.origin + pathname`, so it works on `localhost` / `127.0.0.1` too.

## 2026-08-16 - Clearer multi-event selection

### Changed

- Replaced the active **Done selecting** control with the non-interactive guidance
  **Select the dances below (+ sign)**.
- Renamed the floating bar's **Clear** action to **Cancel** and made it exit selection
  mode, clear selected dances, hide the bar, and restore the normal card actions.

## 2026-08-16 - Experimental style path

### Added

- Added an angled **Styles** connector beneath the Experimental Viewer's location tabs.
- Added a vertical, scroll-revealed list of location-specific dance-style filters. Styles
  remain muted until selected, turn white when active, and filter the event stream and
  its sticky calendar without leaving the page.
- Promoted **West Coast Swing** to the first position and enlarged the **STYLES** route
  label slightly beyond the style-name scale.

## 2026-08-04 - Mint Reactor theme

### Added

- 🎨 **Mint Reactor** palette (14th theme): near-black terminal look with teal
  accents, colors sampled from a reference screenshot Sean supplied
  (bg `#050505`, accent `#14b8a6`, teal-tinted cards `#081512`, warm off-white
  text `#f2f0eb`). First theme to also change typography — the whole viewer
  renders in Martian Mono while it's active. The font loads from Google Fonts
  with `display=swap`; font files download lazily only when the theme is in
  use, so the other 13 palettes are unaffected. Registered in all four theme
  homes (pre-paint allowlist + menu in `index.html`, `VALID` in
  `js/theme-switch.js`, swatch in `css/styles.css`, palette + font rule in
  `css/moonlit-ember-theme.css`) and documented in `docs/THEME-SYSTEM.md`.

## 2026-08-03 - Add to Calendar

### Added

- 📅 **Add to calendar** button on every event card: popover offering a prefilled
  Google Calendar link or an Apple/Outlook `.ics` download, both with correct
  RFC 5545 recurrence (weekly/biweekly/monthly Nth-weekday/monthly date-of-month,
  `UNTIL` from end_date, `EXDATE` from exclude_dates, and exclude_monthly_rules
  enumerated 18 months ahead). Times carry `TZID=America/Chicago` with a full
  VTIMEZONE block.
- **📅 Export these (.ics)** bulk button beside the search box: downloads one
  calendar file of every event currently shown, filters applied; listings without
  firm dates are skipped with a toast count instead of guessed.
- **📅 To my calendar** in the "Share several" select-mode bar: one selected dance
  opens the normal popover; two or more download one .ics of the set (Google's
  one-event-per-link limit is stated in the popover; Google imports the file).
- New self-contained module `js/add-to-calendar.js`; two minimal hooks in
  `js/app.js` (card-action button, select-mode bar button + disabled-state sync, read-only
  `window.DEV_EVENTS_BY_KEY` map);
  themed `.atc-*` CSS block appended to `css/styles.css`.

### Verification

- Node sweep over all 615 canonical events: 610 exportable, 5 honestly declined
  (no firm date), 0 errors; SSO's "every Friday except 1st & 3rd" produced the
  correct EXDATE set; one-time span events export as inclusive all-day ranges.
- jsdom full-page smoke test against a local server: 48 rendered cards → 48
  calendar buttons, bulk button present, popover opens, Google URL valid,
  events map populated.
- `node --check` passed for `app.js` (literal-NUL regex preserved byte-for-byte)
  and `add-to-calendar.js`.

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
