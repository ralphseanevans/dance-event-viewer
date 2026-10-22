-- Submissions review list + admin trust, enforced by Supabase RLS.
-- Project: xyyxbwetagfexsqtokpk.   PROPOSED — NOT APPLIED. Review, then run it yourself
-- (SQL editor or `supabase db push`). Nothing in the browser decides trust; this does.
--
-- Rules (Sean, 2026-10-22):
--   * Anyone (anon, no login) may submit an event or report a problem. Their rows are
--     always status = 'pending' and land in the admin review list.
--   * Only the admin Google account (initially ralphseanevans@gmail.com) may insert a
--     row as 'approved' (goes live right away), read the review list, or change status.
--   * The typed contact name grants nothing.
--   * Explicit GRANTs: from 2026-10-30 Supabase no longer auto-grants new public tables
--     to anon/authenticated, so every privilege below is spelled out.
--
-- The Apps Script intake reads a row back with the CALLER'S token
-- (GET /rest/v1/submissions?id=eq.<id>&status=eq.approved). Under the SELECT policy
-- below only an admin token can see it, so only the admin gets instant publishing.

begin;

-- 1. Who is an admin? Email from the verified JWT, signed in with Google, not anonymous.
--    To add an admin later, add the lower-case email to the array and re-run this function.
create or replace function public.is_submissions_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = any (array['ralphseanevans@gmail.com'])
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google',
    false
  );
$$;
revoke all on function public.is_submissions_admin() from public;
grant execute on function public.is_submissions_admin() to anon, authenticated;

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
                       check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 16384),
  contact_name       text check (char_length(contact_name) <= 100),
  contact_email      text check (char_length(contact_email) <= 200),
  contact_phone      text check (char_length(contact_phone) <= 60),
  flyer_count        smallint not null default 0 check (flyer_count between 0 and 5),
  -- Set by the trigger from the JWT, never by the client:
  submitted_by_email text,
  reviewed_by_email  text,
  reviewed_at        timestamptz,
  review_note        text check (char_length(review_note) <= 1000)
);
comment on table public.submissions is
  'Public event submissions and "Wrong info?" reports. Anon inserts are pending; only public.is_submissions_admin() may approve or read.';
create index if not exists submissions_status_created_idx on public.submissions (status, created_at desc);

-- 3. Server-stamped fields (the client cannot spoof who submitted or reviewed).
create or replace function public.submissions_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.submitted_by_email := auth.jwt() ->> 'email';   -- null for anon
    new.reviewed_by_email := null;
    new.reviewed_at := null;
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
    new.submitted_by_email := old.submitted_by_email;
    if new.status is distinct from old.status then
      new.reviewed_by_email := auth.jwt() ->> 'email';
      new.reviewed_at := now();
    else
      new.reviewed_by_email := old.reviewed_by_email;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.submissions_stamp() from public;
drop trigger if exists submissions_stamp on public.submissions;
create trigger submissions_stamp
  before insert or update on public.submissions
  for each row execute function public.submissions_stamp();

-- 4. Explicit grants (column-level, least privilege). RLS below narrows rows further.
revoke all on table public.submissions from public, anon, authenticated;
grant insert (id, status, submission_kind, intake_method, event_key, details,
              contact_name, contact_email, contact_phone, flyer_count)
  on table public.submissions to anon, authenticated;
grant select on table public.submissions to authenticated;          -- admin only, via RLS
grant update (status, review_note) on table public.submissions to authenticated; -- admin only, via RLS
grant all on table public.submissions to service_role;
-- No DELETE for anon/authenticated: rejected rows stay as an audit trail.

-- 5. Row-level security.
alter table public.submissions enable row level security;
alter table public.submissions force row level security;

drop policy if exists submissions_insert_pending on public.submissions;
create policy submissions_insert_pending
  on public.submissions for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists submissions_insert_admin_approved on public.submissions;
create policy submissions_insert_admin_approved
  on public.submissions for insert
  to authenticated
  with check (status = 'approved' and public.is_submissions_admin());

drop policy if exists submissions_admin_read on public.submissions;
create policy submissions_admin_read
  on public.submissions for select
  to authenticated
  using (public.is_submissions_admin());

drop policy if exists submissions_admin_review on public.submissions;
create policy submissions_admin_review
  on public.submissions for update
  to authenticated
  using (public.is_submissions_admin())
  with check (public.is_submissions_admin());

commit;

-- Checks to run after applying (expected results in comments):
--   select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.submissions'::regclass;  -- t, t
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'submissions' order by 1, 2;
--   -- As anon (publishable key, no session):
--   --   POST /rest/v1/submissions {"status":"pending",...}   -> 201
--   --   POST /rest/v1/submissions {"status":"approved",...}  -> 401/403 (RLS)
--   --   GET  /rest/v1/submissions                            -> 401/403 or []
--   -- As ralphseanevans@gmail.com (Google session): approved insert -> 201, GET -> rows.
