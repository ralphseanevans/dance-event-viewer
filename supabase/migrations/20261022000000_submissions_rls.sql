-- Submissions review list + admin trust, enforced by Supabase RLS.
-- Project: xyyxbwetagfexsqtokpk.   PROPOSED — NOT APPLIED. Review, then run it yourself
-- (SQL editor or `supabase db push`). Nothing in the browser decides trust; this does.
--
-- Rules (Sean, 2026-10-22):
--   * Anyone (anon, no login) may submit an event or report a problem. Their rows are
--     always status = 'pending' and land in the admin review list.
--   * Only an admin (a Supabase auth user id on the submissions_private.submission_admins allowlist)
--     may file a row as 'approved' (goes live right away), read the review list, or
--     change status. The allowlist is keyed by auth.uid(), never by email text.
--   * The typed contact name grants nothing.
--   * Explicit GRANTs: from 2026-10-30 Supabase no longer auto-grants new public tables
--     to anon/authenticated, so every privilege below is spelled out.
--
-- Writes go through ONE function, public.submit_submission(): the server creates the
-- row id and returns it, retries with the same client_key get the same row back, and
-- a throttle trigger limits anon spam. There is no direct INSERT grant on the table.
--
-- The Apps Script intake trusts an approved row only ONCE and only for the exact
-- payload it was filed for: it recomputes the SHA-256 payload hash and, with the
-- CALLER'S token, PATCHes consumed_at on the row filtered by
-- id + status=approved + consumed_at is null + payload_hash. Under the UPDATE policy
-- below only an admin token can do that, and only the first time.

begin;

-- 1. Who is an admin? auth.uid() on a private allowlist (filled in after Sean's first
--    Google sign-in; see SETUP.md step 4). Not anonymous sign-ins.
--    Every submission helper lives in its own schema, submissions_private. This migration
--    never touches the existing `private` schema (submissions_private.events and its sync/guard functions).
--    submissions_private is not an exposed API schema; anon/authenticated get USAGE only so
--    the public RPC wrapper and the RLS policies can call the two functions granted below.
create schema if not exists submissions_private;
revoke all on schema submissions_private from public;
grant usage on schema submissions_private to anon, authenticated;

create table if not exists submissions_private.submission_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  note     text,
  added_at timestamptz not null default now()
);
revoke all on table submissions_private.submission_admins from public, anon, authenticated;

drop function if exists public.is_submissions_admin();
create or replace function submissions_private.is_submissions_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (select 1 from submissions_private.submission_admins a where a.user_id = (select auth.uid()))
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false,
    false
  );
$$;
revoke all on function submissions_private.is_submissions_admin() from public, anon, authenticated;
grant execute on function submissions_private.is_submissions_admin() to authenticated;

-- 2. The review list.
create table if not exists public.submissions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  submission_kind    text not null default 'new_event'
                       check (submission_kind in ('new_event', 'correction')),
  intake_method      text not null default ''
                       check (char_length(intake_method) <= 40),
  event_key          text check (char_length(event_key) <= 200),
  details            jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 6144),
  contact_name       text check (char_length(contact_name) <= 100),
  contact_email      text check (char_length(contact_email) <= 200),
  contact_phone      text check (char_length(contact_phone) <= 60),
  flyer_count        smallint not null default 0 check (flyer_count between 0 and 5),
  -- Retry key chosen by the browser once per submission; reused across its retries.
  client_key         uuid not null unique,
  -- SHA-256 (hex) of the canonical Apps Script payload; binds an approved row to it.
  payload_hash       text check (payload_hash ~ '^[0-9a-f]{64}$'),
  -- Set by triggers from the server/JWT, never by the client:
  client_hint        text,          -- salted hash of the caller IP (throttle only)
  consumed_at        timestamptz,   -- set once when the Apps Script trusted the row
  submitted_by_email text,
  reviewed_by_email  text,
  reviewed_at        timestamptz,
  review_note        text check (char_length(review_note) <= 1000)
);
comment on table public.submissions is
  'Public event submissions and "Wrong info?" reports. Filed via public.submit_submission(); anon rows are pending; only submissions_private.is_submissions_admin() may approve or read.';
create index if not exists submissions_status_created_idx on public.submissions (status, created_at desc);
create index if not exists submissions_hint_created_idx on public.submissions (client_hint, created_at desc);

-- 3. Server-stamped fields (the client cannot spoof id, who submitted or reviewed).
create or replace function public.submissions_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.id := gen_random_uuid();                          -- the server creates the id
    new.created_at := now();
    new.submitted_by_email := auth.jwt() ->> 'email';   -- null for anon
    new.reviewed_by_email := null;
    new.reviewed_at := null;
    new.consumed_at := null;
    if new.status = 'approved' then                       -- admin self-approval
      new.reviewed_by_email := auth.jwt() ->> 'email';
      new.reviewed_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    -- Only review fields may change; everything the submitter sent stays as sent.
    new.id := old.id;
    new.created_at := old.created_at;
    new.submission_kind := old.submission_kind;
    new.intake_method := old.intake_method;
    new.event_key := old.event_key;
    new.details := old.details;
    new.contact_name := old.contact_name;
    new.contact_email := old.contact_email;
    new.contact_phone := old.contact_phone;
    new.flyer_count := old.flyer_count;
    new.client_key := old.client_key;
    new.payload_hash := old.payload_hash;
    new.client_hint := case when new.client_hint is null then null else old.client_hint end; -- may only be cleared (retention)
    new.submitted_by_email := old.submitted_by_email;
    -- consumed_at is one-way: null -> now() once, never cleared or moved.
    if old.consumed_at is null and new.consumed_at is not null then
      new.consumed_at := now();
    else
      new.consumed_at := old.consumed_at;
    end if;
    if new.status is distinct from old.status then
      new.reviewed_by_email := auth.jwt() ->> 'email';
      new.reviewed_at := now();
      -- A review-list decision never makes the row usable by the Apps Script later.
      new.consumed_at := coalesce(old.consumed_at, now());
    else
      new.reviewed_by_email := old.reviewed_by_email;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.submissions_stamp() from public, anon, authenticated;
drop trigger if exists submissions_stamp on public.submissions;
create trigger submissions_stamp
  before insert or update on public.submissions
  for each row execute function public.submissions_stamp();

-- 4. Spam throttle for pending (anon) inserts. Per caller (salted hash of a trustworthy
--    client IP header, when present) and globally. Admin 'approved' rows are exempt.
create table if not exists submissions_private.submission_throttle (
  singleton boolean primary key default true check (singleton),
  salt      text not null default gen_random_uuid()::text
);
insert into submissions_private.submission_throttle (singleton) values (true) on conflict do nothing;
revoke all on table submissions_private.submission_throttle from public, anon, authenticated;

create or replace function submissions_private.submissions_throttle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  per_hint_max  constant int := 5;                    -- per caller per window
  global_max    constant int := 60;                   -- all pending rows per window
  win           constant interval := interval '10 minutes';
  hdrs jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  -- Sources: https://developers.cloudflare.com/fundamentals/reference/http-headers/ and the
  -- hosted request.headers dump in https://github.com/supabase/pg_graphql/issues/400
  -- (cf-connecting-ip = client; x-forwarded-for = "client, cloudflare-edge"). See SETUP.md.
  -- Only sources a client cannot forge: Cloudflare's
  -- cf-connecting-ip, else the RIGHTMOST x-forwarded-for entry (added by the last proxy;
  -- the leftmost entries are whatever the client sent). Neither -> no per-sender hint,
  -- so only the global limit applies.
  xff  text[] := string_to_array(nullif(btrim(coalesce(hdrs ->> 'x-forwarded-for', '')), ''), ',');
  ip   text := coalesce(nullif(btrim(hdrs ->> 'cf-connecting-ip'), ''),
                        nullif(btrim(xff[cardinality(xff)]), ''));
begin
  new.client_hint := null;
  if ip is not null then
    select encode(sha256(convert_to(t.salt || '|' || ip, 'UTF8')), 'hex')
      into new.client_hint from submissions_private.submission_throttle t;
  end if;
  if new.status <> 'pending' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('public.submissions throttle'));
  if (select count(*) from public.submissions s
       where s.status = 'pending' and s.created_at > now() - win) >= global_max
     or (new.client_hint is not null and
         (select count(*) from public.submissions s
           where s.client_hint = new.client_hint and s.created_at > now() - win) >= per_hint_max)
  then
    raise exception 'Too many submissions right now. Please try again in a few minutes.'
      using errcode = 'PT429';                         -- PostgREST answers HTTP 429
  end if;
  return new;
end;
$$;
revoke all on function submissions_private.submissions_throttle() from public, anon, authenticated;
drop trigger if exists submissions_throttle on public.submissions;
create trigger submissions_throttle                    -- runs after submissions_stamp (name order)
  before insert on public.submissions
  for each row execute function submissions_private.submissions_throttle();

-- 5. The one write path for the site. Server-made id; idempotent on client_key.
--    submissions_private.* does the work as the owner (RLS bypass) and enforces the rules itself;
--    public.submit_submission is a thin invoker wrapper so no security definer
--    function sits in the exposed schema.
create or replace function submissions_private.submit_submission(
  p_client_key uuid, p_status text, p_payload_hash text, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  if p_client_key is null or p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'client key and row are required' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('pending', 'approved') then
    raise exception 'status must be pending or approved' using errcode = '22023';
  end if;
  if p_status = 'approved' and not submissions_private.is_submissions_admin() then
    raise exception 'only an admin may file an approved submission' using errcode = '42501';
  end if;
  if p_status = 'approved' and p_payload_hash is null then
    raise exception 'an approved submission needs its payload hash' using errcode = '22023';
  end if;

  -- A retry of the same submission returns the row it already made (no duplicates).
  select s.id, s.status into v_id, v_status from public.submissions s where s.client_key = p_client_key;
  if found then return jsonb_build_object('id', v_id, 'status', v_status); end if;

  insert into public.submissions (client_key, status, payload_hash, submission_kind, intake_method,
                                  event_key, details, contact_name, contact_email, contact_phone, flyer_count)
  values (p_client_key, p_status, p_payload_hash,
          coalesce(p_row ->> 'submission_kind', 'new_event'),
          coalesce(p_row ->> 'intake_method', ''),
          p_row ->> 'event_key',
          coalesce(p_row -> 'details', '{}'::jsonb),
          p_row ->> 'contact_name', p_row ->> 'contact_email', p_row ->> 'contact_phone',
          coalesce((p_row ->> 'flyer_count')::smallint, 0))
  on conflict (client_key) do nothing
  returning id, status into v_id, v_status;
  if v_id is null then  -- lost a race with a concurrent retry of the same submission
    select s.id, s.status into v_id, v_status from public.submissions s where s.client_key = p_client_key;
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;
revoke all on function submissions_private.submit_submission(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function submissions_private.submit_submission(uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.submit_submission(
  p_client_key uuid, p_status text, p_payload_hash text, p_row jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select submissions_private.submit_submission(p_client_key, p_status, p_payload_hash, p_row); $$;
revoke all on function public.submit_submission(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_submission(uuid, text, text, jsonb) to anon, authenticated;

-- 6. Explicit table grants (column-level, least privilege). RLS below narrows rows further.
--    No INSERT for anon/authenticated: rows are filed only through submit_submission().
revoke all on table public.submissions from public, anon, authenticated;
grant select on table public.submissions to authenticated;          -- admin only, via RLS
grant update (status, review_note, consumed_at) on table public.submissions to authenticated; -- admin only, via RLS
grant all on table public.submissions to service_role;
-- No DELETE for anon/authenticated: rejected rows stay as an audit trail.

-- 7. Row-level security.
alter table public.submissions enable row level security;
alter table public.submissions force row level security;

drop policy if exists submissions_insert_pending on public.submissions;
drop policy if exists submissions_insert_admin_approved on public.submissions;

drop policy if exists submissions_admin_read on public.submissions;
create policy submissions_admin_read
  on public.submissions for select
  to authenticated
  using ((select submissions_private.is_submissions_admin()));

drop policy if exists submissions_admin_review on public.submissions;
create policy submissions_admin_review
  on public.submissions for update
  to authenticated
  using ((select submissions_private.is_submissions_admin()))
  with check ((select submissions_private.is_submissions_admin()));

commit;

-- Checks to run after applying (expected results in comments):
--   select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.submissions'::regclass;  -- t, t
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'submissions' order by 1, 2;   -- no INSERT for anon/authenticated
--   -- As anon (publishable key, no session):
--   --   POST /rest/v1/rpc/submit_submission {"p_client_key":"<uuid>","p_status":"pending","p_payload_hash":null,"p_row":{}}
--   --        -> 200 {"id":"<server uuid>","status":"pending"}; same key again -> same id
--   --   same with "p_status":"approved"                           -> 403 (42501)
--   --   POST /rest/v1/submissions                                  -> 401/403 (no INSERT grant)
--   --   GET  /rest/v1/submissions                                  -> 401/403 or []
--   --   6th pending submit from one IP inside 10 minutes           -> 429
--   -- As the allowlisted admin (Google session): approved -> 200, GET -> rows.
