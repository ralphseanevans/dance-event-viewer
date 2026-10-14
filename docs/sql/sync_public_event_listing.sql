-- Snapshot of the live sync function and triggers on private.events.
-- Project xyyxbwetagfexsqtokpk, read with pg_get_functiondef / pg_get_triggerdef on 2026-10-13.
-- Reference only: this is what is deployed, not a migration to re-run blindly.
-- No secrets or JWTs were present in these bodies.
--
-- Flow: private.events (source of truth) --trigger--> public.event_listings (what the site reads).
-- record_status <> 'active' removes the public row. dance_events.json is a generated fallback.

-- =========================================================================
-- 1. Sync: private.events -> public.event_listings
-- =========================================================================
-- private.sync_public_event_listing()
CREATE OR REPLACE FUNCTION private.sync_public_event_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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

CREATE TRIGGER sync_public_event_listing_after_change AFTER INSERT OR DELETE OR UPDATE ON private.events FOR EACH ROW EXECUTE FUNCTION private.sync_public_event_listing();

-- =========================================================================
-- 2. Other triggers on private.events
-- =========================================================================
-- private.guard_event_update()
CREATE OR REPLACE FUNCTION private.guard_event_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or private.is_dashboard_admin() then
    new.version := old.version + 1;
    new.updated_at := now();
    return new;
  end if;
  if not private.can_access_event(old.id) then
    raise exception 'event access denied' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.event_key is distinct from old.event_key
     or new.source_type is distinct from old.source_type or new.source_detail is distinct from old.source_detail
     or new.source_skill is distinct from old.source_skill or new.first_seen is distinct from old.first_seen
     or new.added_to_calendar is distinct from old.added_to_calendar or new.calendar_event_id is distinct from old.calendar_event_id
     or new.in_wcs_list is distinct from old.in_wcs_list or new.research_batch is distinct from old.research_batch
     or new.research_confidence is distinct from old.research_confidence or new.record_status is distinct from old.record_status
     or new.created_at is distinct from old.created_at or new.version is distinct from old.version then
    raise exception 'volunteers cannot change protected event fields' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$function$;

CREATE TRIGGER guard_event_update_before_change BEFORE UPDATE ON private.events FOR EACH ROW EXECUTE FUNCTION private.guard_event_update();

-- private.log_event_activity()
CREATE OR REPLACE FUNCTION private.log_event_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  old_json jsonb;
  new_json jsonb;
  fields text[];
  actor_kind_value text;
  target_id uuid;
begin
  old_json := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_json := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_id := case when tg_op = 'DELETE' then old.id else new.id end;

  select coalesce(array_agg(k order by k), '{}'::text[])
    into fields
  from (
    select key as k from jsonb_each(coalesce(old_json, '{}'::jsonb))
    union
    select key as k from jsonb_each(coalesce(new_json, '{}'::jsonb))
  ) keys
  where old_json -> k is distinct from new_json -> k;

  actor_kind_value := case
    when (select auth.uid()) is null then 'system'
    when private.is_owner_admin() then 'owner_admin'
    else 'volunteer'
  end;

  insert into private.activity_log (
    entity_type, entity_id, event_id, action, actor_user_id, actor_kind,
    changed_fields, old_record, new_record, request_id
  ) values (
    'event', target_id, case when tg_op = 'DELETE' then null else target_id end,
    lower(tg_op), (select auth.uid()), actor_kind_value,
    fields, old_json, new_json, nullif(current_setting('request.id', true), '')
  );
  return coalesce(new, old);
end;
$function$;

CREATE TRIGGER log_event_activity_after_change AFTER INSERT OR DELETE OR UPDATE ON private.events FOR EACH ROW EXECUTE FUNCTION private.log_event_activity();

-- =========================================================================
-- 3. Helpers used by guard_event_update()
-- (is_owner_admin, is_volunteer_admin, is_active_dashboard_user not captured here)
-- =========================================================================
-- private.can_access_event(uuid)
CREATE OR REPLACE FUNCTION private.can_access_event(target_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.is_dashboard_admin() or (
    private.is_active_dashboard_user()
    and exists (
      select 1 from public.event_assignments a
      where a.event_id = target_event_id
        and a.user_id = (select auth.uid())
        and a.active
    )
  );
$function$;

-- private.is_dashboard_admin()
CREATE OR REPLACE FUNCTION private.is_dashboard_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.is_owner_admin() or private.is_volunteer_admin();
$function$;
