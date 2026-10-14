-- 2026-10-13: Remove the hardcoded legacy service_role JWT from the
-- notify_dashboard_signup trigger. NOT APPLIED. Project xyyxbwetagfexsqtokpk.
--
-- Prerequisites (see docs/security/rotate-signup-trigger-key.md):
--   * Vault secret named 'signup_trigger_key' exists (the sb_secret 'signup-trigger' key).
--   * Edge function notify-dashboard-signup redeployed with the shared-secret check,
--     verify_jwt = false, and function secret SIGNUP_TRIGGER_KEY set to the same value.
-- Extensions verified present (read-only, 2026-10-13): pg_net 0.20.4 (schema extensions),
-- supabase_vault 0.3.1 (schema vault).
--
-- Idempotent: safe to run more than once. Contains no secret values.

begin;

drop trigger if exists notify_dashboard_signup on public.dashboard_signup_notifications;

create schema if not exists private;

create or replace function private.notify_dashboard_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select ds.decrypted_secret
    into v_key
    from vault.decrypted_secrets ds
   where ds.name = 'signup_trigger_key'
   limit 1;

  if v_key is null then
    -- Never block the signup insert; the row stays 'queued' for a retry.
    raise warning 'notify_dashboard_signup: vault secret signup_trigger_key is missing';
    return new;
  end if;

  perform net.http_post(
    url := 'https://xyyxbwetagfexsqtokpk.supabase.co/functions/v1/notify-dashboard-signup',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_key
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function private.notify_dashboard_signup() from public, anon, authenticated;

create trigger notify_dashboard_signup
  after insert on public.dashboard_signup_notifications
  for each row execute function private.notify_dashboard_signup();

commit;

-- ---------------------------------------------------------------------------
-- ROLLBACK (commented out). The old trigger embedded a legacy service_role JWT;
-- do NOT paste that key back. Rolling back only makes sense before the legacy
-- keys are disabled, and you must substitute a key manually at run time:
--
-- begin;
-- drop trigger if exists notify_dashboard_signup on public.dashboard_signup_notifications;
-- drop function if exists private.notify_dashboard_signup();
-- create trigger notify_dashboard_signup
--   after insert on public.dashboard_signup_notifications
--   for each row execute function supabase_functions.http_request(
--     'https://xyyxbwetagfexsqtokpk.supabase.co/functions/v1/notify-dashboard-signup',
--     'POST',
--     '{"Content-type":"application/json","Authorization":"Bearer <KEY_PLACEHOLDER>"}',
--     '{}', '5000');
-- commit;
-- (Also redeploy the previous edge function version with verify_jwt = true.)
