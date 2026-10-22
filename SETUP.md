# Setup: admin Google sign-in + submission review list

This PR is **code only**. Nothing below has been changed by the PR. Each step is a
setting Sean makes by hand in a dashboard. Do not paste secrets into this repo: the
Google client secret goes only into the Supabase dashboard.

Public values used below (both appear in the public site config `dance-event-viewer/js/supabase-config.js`):

| What | Value |
|---|---|
| Supabase project ref | `xyyxbwetagfexsqtokpk` |
| Supabase URL | `https://xyyxbwetagfexsqtokpk.supabase.co` |
| Production origin | `https://danceeventviewer.net` |
| Local server port | `8123`: `Operations/Tools/serve_checkout.mjs` in the DanceEventViewerProject workspace (`const PORT = 8123`, binds `127.0.0.1`, URL `http://127.0.0.1:8123/dance-event-viewer/`). If you serve the checkout another way, use that port instead. |

How it works: anyone can submit or report a problem with no login. Each post is filed in
`public.submissions` as `pending` (the admin review list) and then sent to the Apps Script
intake as before. "Admin sign-in" (Google via Supabase Auth) is optional and only matters
for `ralphseanevans@gmail.com`. Supabase lets only the allowlisted admin **user id** file
`approved` rows (live right away) or read the list. **A typed name grants nothing.** Sign-in sends
`redirectTo = window.location.origin + window.location.pathname`, so the same code works on
production, `localhost` and `127.0.0.1`.

## 1. Google Cloud: OAuth consent screen (Google Auth Platform → Branding / Audience / Data access)

- User type: **External**.
- App name: `Dance Event Viewer`. User support email and developer contact: `ralphseanevans@gmail.com`.
- App domain / home page: `https://danceeventviewer.net`.
- Authorized domains: `danceeventviewer.net` and `xyyxbwetagfexsqtokpk.supabase.co`.
- Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (the defaults; these need no Google verification).
- Publishing status: either **Testing** with test user `ralphseanevans@gmail.com`, or **In production**. With only the basic scopes, production needs no review. Testing-mode refresh tokens expire after 7 days.

## 2. Google Cloud: OAuth client (Clients → Create client → **Web application**)

- Name: `Dance Event Viewer (Supabase Auth)`
- **Authorized JavaScript origins** (exact match, no paths, no trailing slash):
  - `https://danceeventviewer.net`
  - `http://localhost:8123`
  - `http://127.0.0.1:8123`

  (With the Supabase redirect flow, the browser never calls Google from these origins directly. They are harmless, and Google requires them if Google Identity Services or One Tap is ever added. Google allows `http` and the `127.0.0.1` IP only for loopback.)
- **Authorized redirect URIs** (exactly one is needed):
  - `https://xyyxbwetagfexsqtokpk.supabase.co/auth/v1/callback`
- Copy the **Client ID** and **Client secret** straight into Supabase (step 3). Do not commit them anywhere.

## 3. Supabase dashboard: Authentication

**Sign In / Providers → Google**
- Enable **Google**.
- Client ID (for OAuth): the Web client ID from step 2.
- Client Secret (for OAuth): the secret from step 2.
- Leave "Skip nonce checks" **off**. Callback URL shown there must equal `https://xyyxbwetagfexsqtokpk.supabase.co/auth/v1/callback`.

**Sign In / Providers → Email**
- Keep **Confirm email ON**. Then nobody can register `ralphseanevans@gmail.com` with a password without owning the inbox. (The admin check is by Supabase user id, not email, so a second account with the same email would not be an admin anyway.)

**URL Configuration**
- **Site URL**: `https://danceeventviewer.net`
- **Redirect URLs** (allow-list). Keep any entries already there, such as the dashboard's, and add:
  - `https://danceeventviewer.net/dance-event-viewer/submit-event.html`
  - `https://danceeventviewer.net/dance-event-viewer/`
  - `https://danceeventviewer.net/dance-event-viewer/index.html`
  - `http://localhost:8123/**`
  - `http://127.0.0.1:8123/**`

  (Simpler but looser alternative for production: `https://danceeventviewer.net/**`. If a `redirectTo` is not on the list, Supabase silently sends the user to the Site URL instead. That is the usual "localhost sign-in lands on production" symptom.)

## 4. Supabase database: apply the proposed migration (after review)

- File: `supabase/migrations/20261022000000_submissions_rls.sql` (not applied by this PR).
- It creates `public.submissions`, the private admin allowlist `private.submission_admins`
  with the check `private.is_submissions_admin()` (`auth.uid()` on the allowlist, not anonymous),
  the stamping and throttle triggers, and the one write path `public.submit_submission()`.
  It sets **explicit GRANTs**, because from 2026-10-30 Supabase no longer auto-grants new public tables:
  - anon / authenticated: **no** direct `INSERT`; they call `rpc/submit_submission`. The server
    creates the row id and returns it. A retry with the same `client_key` returns the same row.
  - anon `pending` rows are throttled: more than 5 from one caller (salted hash of the IP) or
    more than 60 in total within 10 minutes get HTTP 429. `details` is capped at 6 KB.
  - admin only: `approved` rows, `SELECT` (review list), `UPDATE status/review_note/consumed_at`.
    `consumed_at` can only be set once (the Apps Script does that when it trusts a row).
  - `private.is_submissions_admin()` is executable by `authenticated` only (not `anon`).
  - no `DELETE` for anon/authenticated
- **After applying, the admin list is empty**, so nobody is admin yet and everything goes to
  review. Fill it in after Sean's first Google sign-in (step 6.2 creates the user):
  Authentication → Users → copy the user id (UUID) of `ralphseanevans@gmail.com`, then in the
  SQL editor:

  ```sql
  insert into private.submission_admins (user_id, note)
  values ('<paste the user id here>', 'Sean')
  on conflict do nothing;
  ```

  To add another admin later, insert their user id the same way (`delete from
  private.submission_admins where user_id = '...'` removes one). For the cosmetic UI, also add
  the email to `adminEmails` in `js/supabase-config.js`.
- Post-apply checks are at the bottom of the file.

Until this is applied, the site still works. The Supabase call fails quietly (or gives up after 4 seconds), the
submission goes to the Apps Script intake with no trust, and so everything goes to review.

## 5. Apps Script intake (`tools/apps-script/Submission_AppsScript_Code.gs`)

- **Immediate fix (can be done today, before this PR merges):** Project Settings → Script Properties → **delete `TRUSTED_NAME_PATTERN`**. The deployed code then trusts no typed name, and all public posts go to review.
- Add Script Property **`SUPABASE_PUBLISHABLE_KEY`** = the same public publishable key that is in `js/supabase-config.js`. It is public, not a secret. The intake uses it, plus the caller's own access token, to mark the approved row consumed under RLS. It recomputes a SHA-256 of the payload it received and only matches a row whose stored `payload_hash` is the same, so an admin token plus a row id cannot be replayed with other content, or used twice.
- Paste the updated `.gs`, then Deploy → Manage deployments → edit the existing deployment → **New version**. The `/exec` URL stays the same.
- Trust bases after this change: `supabase-admin` (an unconsumed approved row with a matching payload hash, consumed with the caller's token) or `dashboard-auth` (the existing `DASHBOARD_PASSWORD` / `REVIEW_TOKEN`, sent by `dance-dashboard.html`). New Sheet columns `trust_basis` and `supabase_submission_id` are added automatically.

## 6. Verify

1. Logged out, at `https://danceeventviewer.net/dance-event-viewer/submit-event.html`: submit with name "Ralph". The page should say "in for review", and the row should be `pending`.
2. Click **Admin sign-in** → Google → you return to the same page with an "Admin" chip, and the review list appears with the row from step 1.
3. Submit while signed in: "Your event is live" (the Sheet's `trust_basis` = `supabase-admin`). This needs your user id in `private.submission_admins` (step 4). The row's `consumed_at` is now set.
4. Locally: run `node Operations/Tools/serve_checkout.mjs` (workspace repo), then open `http://127.0.0.1:8123/dance-event-viewer/submit-event.html` and repeat step 2. Then do the same on `http://localhost:8123/...`. You should come back to the local page, not to production.
5. Sign in with a different Google account. You should see no Admin chip, your posts stay `pending`, and the review list is empty or refused.
