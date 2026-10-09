-- Cancel banners: per-occurrence and whole-event cancellation for the public viewer.
-- Project: xyyxbwetagfexsqtokpk.  NOT YET APPLIED — run after the viewer PR is merged.
-- The viewer already requests these columns and falls back to the old select (HTTP 400 → retry)
-- until they exist, so this can run any time after the merge.
--
-- Shapes (see docs/cancel-banners.md):
--   canceled_dates jsonb  — array of {"date":"YYYY-MM-DD","cancel_status":"confirmed|likely|owner","reason":"weather"}
--                           A canceled date still shows on the calendar with the banner;
--                           exclude_dates (unchanged) hides a date entirely.
--   cancel_status  text   — whole-event cancellation: 'confirmed' | 'likely' | 'owner'; NULL = not canceled.
-- Not to be confused with private.events.record_status = 'cancelled', which removes the
-- row from public.event_listings (the event disappears instead of showing a banner).

begin;

-- 1. Columns + checks on the source of truth.
alter table private.events
  add column if not exists canceled_dates jsonb,
  add column if not exists cancel_status  text;
alter table private.events
  add constraint events_cancel_status_check
    check (cancel_status is null or cancel_status in ('confirmed', 'likely', 'owner')),
  add constraint events_canceled_dates_array_check
    check (canceled_dates is null or jsonb_typeof(canceled_dates) = 'array');

-- 2. Same columns on the public copy the viewer reads.
alter table public.event_listings
  add column if not exists canceled_dates jsonb,
  add column if not exists cancel_status  text;
alter table public.event_listings
  add constraint event_listings_cancel_status_check
    check (cancel_status is null or cancel_status in ('confirmed', 'likely', 'owner')),
  add constraint event_listings_canceled_dates_array_check
    check (canceled_dates is null or jsonb_typeof(canceled_dates) = 'array');
-- anon/authenticated already have table-level SELECT on public.event_listings (checked
-- 2026-10-09), so the new columns are readable without further grants.

-- 3. Sync trigger function: identical to the live definition (read 2026-10-09) plus the
--    two new columns in the insert list, values list, and on-conflict update.
create or replace function private.sync_public_event_listing()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.event_listings where key = old.event_key;
    return old;
  end if;
  if new.record_status <> 'active' then
    delete from public.event_listings where key = new.event_key;
    return new;
  end if;
  insert into public.event_listings (
    key,name,style,type,day_of_week,monthly_rule,exclude_monthly_rules,start_date,end_date,
    start_time,end_time,venue,state,cost,source_url,exclude_dates,unverified,verified_on,flyer_url,updated_at,added_on,added_by,
    canceled_dates,cancel_status
  ) values (
    new.event_key,new.name,new.style,new.event_type,new.day_of_week,new.monthly_rule,new.exclude_monthly_rules,
    new.start_date,new.end_date,new.start_time,new.end_time,new.venue,new.state,new.cost,new.source_url,
    new.exclude_dates,coalesce(new.research_confidence = 'low',false),
    case when new.last_confirmed ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then new.last_confirmed else null end,
    new.flyer_url,now(),
    case when new.first_seen ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then new.first_seen else null end,
    case new.source_skill when 'wcs-email-scanner' then 'Email Scanner' when 'wcs-facebook-group-scanner' then 'Facebook Scanner' when 'wcs-fbmessenger' then 'Messenger Scanner' when 'wcs-flyer-scanner' then 'Messenger Scanner' when 'wcs-flyer-upload' then 'Flyer Upload' when 'manual' then 'Manual Entry' when 'manual-user-confirmation' then 'Manual Entry' when 'national-events-research' then 'National Events Research' when 'web-submission' then 'Web Submission' else null end,
    new.canceled_dates,new.cancel_status
  )
  on conflict (key) do update set
    name=excluded.name,style=excluded.style,type=excluded.type,day_of_week=excluded.day_of_week,
    monthly_rule=excluded.monthly_rule,exclude_monthly_rules=excluded.exclude_monthly_rules,
    start_date=excluded.start_date,end_date=excluded.end_date,start_time=excluded.start_time,
    end_time=excluded.end_time,venue=excluded.venue,state=excluded.state,cost=excluded.cost,
    source_url=excluded.source_url,exclude_dates=excluded.exclude_dates,unverified=excluded.unverified,
    verified_on=excluded.verified_on,flyer_url=excluded.flyer_url,updated_at=now(),
    added_on=excluded.added_on,added_by=excluded.added_by,
    canceled_dates=excluded.canceled_dates,cancel_status=excluded.cancel_status;
  return new;
end;
$function$;

commit;

-- Not covered here (optional follow-ups):
--   * public.dashboard_events / public.dashboard_events_admin are views whose column lists
--     were fixed when they were created; recreate them if the dashboard should show/edit
--     the new columns.
--   * The private repo's dance_events.json exporter (fixed 18-field list) and
--     build_share_pages.mjs (static e/ pages) need the new fields — see docs/cancel-banners.md.

-- ---------------------------------------------------------------------------------------
-- 4. DATA UPDATES for the data bot — run AFTER steps 1–3 (commented out on purpose).
--    They mirror the dance_events.json changes in this PR. The sync trigger copies each
--    row to public.event_listings.
--
-- Sensual Sundays, Sun 2026-10-11 — canceled for the hurricane (Sean's listing correction
-- email 2026-10-09 11:13 CT, "cancel this event due to hurricane"; PR #5). No organizer
-- post found, so 'confirmed' rather than 'owner'. Moves the date from exclude_dates
-- (hidden) to canceled_dates (shown with banner).
-- update private.events
--    set exclude_dates  = exclude_dates - '2026-10-11',
--        canceled_dates = coalesce(canceled_dates, '[]'::jsonb)
--                         || '[{"date":"2026-10-11","cancel_status":"confirmed","reason":"weather"}]'::jsonb
--  where event_key = 'sensual-sundays-bachata-pensacola-coastals';
--
-- Wild Greg's Country Swing, Fri 2026-10-09 — "this Friday's event is canceled due to the
-- hurricane" (Sean's listing correction email 2026-10-09 15:14 CT; PR #6). 'confirmed'.
-- exclude_dates becomes NULL when emptied, matching how dance_events.json stored it before PR #6.
-- update private.events
--    set exclude_dates  = nullif(exclude_dates - '2026-10-09', '[]'::jsonb),
--        canceled_dates = coalesce(canceled_dates, '[]'::jsonb)
--                         || '[{"date":"2026-10-09","cancel_status":"confirmed","reason":"weather"}]'::jsonb
--  where event_key = 'ttdgc-wild-gregs-country-swing-friday';
--
-- Note on the data bot's planned statement: `exclude_dates - '2026-10-11'` leaves [] if it was
-- the only date; Sensual Sundays keeps Aug 16/23/30, so that's fine there.
--
-- Not marked (could not identify with confidence; see the PR description):
--   "the Saturday night dance" (Sat Oct 10) and a Sat Oct 10 chapel dance in East Hill.
