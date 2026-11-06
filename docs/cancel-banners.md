# Cancel banners

A canceled event keeps showing on the site, with a semi-transparent yellow bar across the middle of its flyer. That way people who saw the event before can find out it is off. The flyer images are never edited; the bar is drawn by CSS on top of them.

## The three variants

| `cancel_status` | Bar text | When to use |
|---|---|---|
| `confirmed` | CONFIRMED CANCELED | The cancellation is certain (for example a trusted correction, or the venue is closed). |
| `likely` | LIKELY CANCELED | Probable but not official. **This is the default** whenever the status is missing or unknown. |
| `owner` | Officially canceled. | Only when the host/owner explicitly authorized it. Never a default or fallback: missing or unknown status shows LIKELY CANCELED. |

These three are the only labels. There is no free-text label field.

## How to mark something canceled

**One date of a recurring series**: add an entry to `canceled_dates`:

```json
"canceled_dates": [
  { "date": "2026-10-11", "cancel_status": "confirmed", "reason": "weather" }
]
```

That date still appears in the timeline and on the calendar. It shows the banner on its card, and its calendar chip is struck through. Other dates in the series are not affected. `reason` is optional; when set, it is shown as a short note under the banner (main viewer cards and lightbox, and the /gulfcoast/ full listing and details).

Accepted entry shapes (all read by the same rules, `dance-event-viewer/js/cancel-core.js`):

- `"2026-10-11"`: a plain date string. Shows LIKELY CANCELED with no note.
- `{ "date": "2026-10-11", "cancel_status": "confirmed", "reason": "weather" }`: the current shape.
- `{ "date": "2026-10-11", "status": "confirmed", "note": "weather", "source": "…", "labeled_by": "…", "labeled_at": "…" }`: the planned shape. Not written to the database yet; the site already reads it. `status`/`note` win over `cancel_status`/`reason` when both are present. Extra keys are ignored.

A missing or unknown status shows LIKELY CANCELED. `owner` is shown only when the entry or event literally says `owner`; nothing else (including `owner_auth` or `source`) ever turns into `owner`.

**Precedence** for one date: a matching `canceled_dates` entry (the last one, if a date is listed twice) beats the event's `cancel_status`, which beats the legacy `canceled`/`cancelled: true`.

**`end_date` on a recurring series** ends it: no dates after `end_date` are shown at all, so a `canceled_dates` entry after the end date never appears. To label a canceled week, the series must still be running on that date.

`exclude_dates` works differently: a date listed there is **hidden** entirely. Use `exclude_dates` for "the series doesn't meet that day" and `canceled_dates` for "it was going to happen and got called off".

**A whole event** (usually a one-off): set `"cancel_status": "confirmed"` (or `likely` / `owner`) on the event. Any non-empty `cancel_status` means the whole event is canceled. The legacy `"canceled": true` (or `"cancelled": true`) is still accepted and treated as `likely`.

Don't use the dashboard's **Cancel Event** button for this. It sets `record_status = 'cancelled'`, which removes the event from the public site altogether.

## Where the data lives

- Supabase: `private.events.canceled_dates` (jsonb) and `private.events.cancel_status` (text with a check constraint). The `sync_public_event_listing` trigger copies them to `public.event_listings`. See `docs/migrations/canceled_dates.sql`.
- `dance_events.json` (the static fallback): the same fields, only on events that use them.
- The viewer asks Supabase for `canceled_dates,cancel_status` along with its usual 19 fields. If those columns don't exist yet, it retries with the old field list, so the site keeps working.

## How it works (for developers)

- **CSS:** `dance-event-viewer/css/cancel-banner.css`. Put `.is-canceled` plus one modifier (`.cancel-banner--confirmed`, `--likely`, or `--owner`) on the element that wraps the image. That element must be sized to the image and must take its width from its container. The label is a `::after` pseudo-element, sized with container query units (`cqw`) so it stays on one line on small cards and big pages, with a `clamp()`/`vw` fallback. Include `<span class="cancel-banner-sr">Confirmed canceled.</span>` inside the wrapper for screen readers. The visible pseudo-element text is hidden from them.
- **Shared rules** (`dance-event-viewer/js/cancel-core.js`, added 2026-10-31): one plain script that sets `globalThis.DEVCancel`. Every place that decides "is this canceled" uses it: the main viewer (`<script>` tag before `app.js`), `/gulfcoast/` simple and full mode (`import '…/cancel-core.js?v=…'`), and the Node page builders through `tools/event_schedule.mjs`. Do not copy these rules anywhere else.
  - `DEVCancel.LABELS` maps each status to its text. Keep it in sync with the CSS modifiers.
  - `DEVCancel.cancellationFor(ev, 'YYYY-MM-DD')` returns `{status, label, whole, note, reason}` (`reason` is the same as `note`) or `null`. Without a date it checks only the whole-event fields.
  - `DEVCancel.normalizeCanceledDates(list)` turns any mix of accepted entries into `{date, status, note}` and drops malformed ones.
  - Tests: `tools/tests/cancel_core.test.mjs`.
- **JS** (`dance-event-viewer/js/app.js`):
  - `cancellationFor(ev, date)` takes a `Date` and calls the shared rules.
  - `applyCancelBanner(wrapper, cancel)` adds the classes and the screen-reader text, and prefixes the wrapper's `aria-label`.
  - These are used by event cards (timeline, list, map popup, calendar popup), the enlarged-flyer lightbox, and the calendar day chips. A canceled event with no flyer gets a yellow badge with the same text.
- **Static event pages (`e/*.html`):** these are generated by `build_share_pages.mjs` in the private project, not in this repo. To show the banner there, the generator should:
  1. link `/dance-event-viewer/css/cancel-banner.css`;
  2. wrap the flyer as `<div class="flyer-frame is-canceled cancel-banner--STATUS"><img class="flyer" …><span class="cancel-banner-sr">…</span></div>`, with `.flyer-frame{margin:12px 0}` and `.flyer-frame img.flyer{display:block;width:100%;margin:0}`;
  3. set the JSON-LD `eventStatus` to `https://schema.org/EventCancelled` for a whole-event cancellation. For a recurring series, only when the page's displayed `startDate` is the canceled date.

- **/gulfcoast/ full mode** reads the `dance-events` edge feed. Its field list (`tools/supabase/functions/dance-events/feed.mjs`) now includes `canceled_dates` and `cancel_status`, but that takes effect only once the function is redeployed. Until then, `gulfcoast/app.js` reads just `key,canceled_dates,cancel_status` from the public `event_listings` table with the site's public key (a read-only GET) and merges them in by key. A canceled date gets a yellow label tag with the same text as the banner.

  The private `dance_events.json` exporter also needs `canceled_dates` and `cancel_status` added to its fixed 18-field list, or the next publish will drop them from the JSON.
