# Rotate the signup-trigger key (remove the hardcoded legacy key)

**Status: prepared, not applied.** Project `xyyxbwetagfexsqtokpk`.

## What was wrong
The database trigger `notify_dashboard_signup` (on `public.dashboard_signup_notifications`)
called the `notify-dashboard-signup` edge function with an old **legacy service_role JWT**
pasted straight into the trigger definition. Anyone who can read the schema can read that key.

## The fix, in plain English
- The new secret key (`sb_secret_…`, named **signup-trigger**) is kept in **Supabase Vault**,
  not in the trigger.
- A new trigger function reads it from Vault each time a signup row is inserted and sends it
  to the edge function in an `x-webhook-secret` header (via `pg_net`).
- The edge function turns **off** "Verify JWT" (new `sb_secret_` keys are not JWTs) and instead
  checks that header against its own secret `SIGNUP_TRIGGER_KEY`. Wrong/missing header → 401.
- The function keeps using the platform-provided default secret key for its own database writes.

Where the key lives: 1Password vault **Bot Keys**, item
**"DEV Coder – Supabase secret key signup-trigger (project xyyxbwetagfexsqtokpk)"**,
field **credential**. Kos manages it. Never paste it into git, chat, or tickets.

## Steps for Sean (do them in this order)

### 1. Put the key in Vault as `signup-trigger`
Option A – Vault UI: Dashboard → Project Settings → **Vault** (or Integrations → Vault) →
**Add new secret** → Name `signup-trigger` → Secret: paste from 1Password → Save.

Option B – SQL Editor (Dashboard → SQL Editor → New query). Replace the placeholder, run,
then **delete the query text / don't save the snippet**:
```sql
select vault.create_secret('<PASTE_FROM_1PASSWORD>', 'signup-trigger',
                           'sb_secret signup-trigger key for notify-dashboard-signup');
```
Check (shows the name only, not the value):
```sql
select name, created_at from vault.secrets where name = 'signup-trigger';
```

### 2. Deploy the edge function change FIRST, then the migration
Order matters: once the migration runs, the trigger stops sending the old JWT.

a. Dashboard → **Edge Functions** → `notify-dashboard-signup` → **Secrets** (or Project
   Settings → Edge Functions → Secrets) → **Add** `SIGNUP_TRIGGER_KEY` = same value from 1Password.
b. Redeploy the function from `tools/supabase/functions/notify-dashboard-signup/index.ts`
   (CLI: `supabase functions deploy notify-dashboard-signup --no-verify-jwt`), or paste the code
   in the dashboard editor and **Deploy**.
c. Function → **Details** → turn **Enforce JWT verification / Verify JWT** **off**. Save.

### 3. Apply the migration (DEV Events or Sean)
Dashboard → SQL Editor → paste `docs/migrations/2026-10-13_signup_trigger_no_hardcoded_key.sql`
→ Run. It is safe to run twice. Confirm no key remains:
```sql
select pg_get_triggerdef(oid) from pg_trigger
 where tgname = 'notify_dashboard_signup';           -- should call private.notify_dashboard_signup()
select count(*) from pg_trigger where encode(tgargs,'escape') like '%eyJ%';  -- expect 0
```

### 4. Test
- Create a test dashboard signup (new account), **or** insert a queue row the same way the
  app does (`private.queue_dashboard_signup_notification()` handles real signups).
- Check: Edge Functions → `notify-dashboard-signup` → **Logs/Invocations**: expect a 200
  (not 401/503). Owner email arrives. Row status becomes `sent`.
- pg_net side: `select status_code, error_msg, created from net._http_response order by created desc limit 5;`
- If you see 401: Vault value and `SIGNUP_TRIGGER_KEY` don't match. If 503: function secret missing.

### 5. Only then disable the legacy keys
Dashboard → Project Settings → **API Keys** → **Legacy API Keys** tab → **Disable JWT-based API keys**.
(Treat the leaked service_role JWT as compromised; disabling is what actually kills it.)

### 6. Make sure nothing else still uses the legacy anon/service_role JWTs
Before step 5, check:
- **`dance-events` edge function** uses `SUPABASE_ANON_KEY` (legacy anon JWT) in `index.ts`.
  Switch it to the publishable key (e.g. read `SUPABASE_PUBLISHABLE_KEYS` / a function secret
  with the `sb_publishable_` key, sent as `apikey` only), redeploy, and test the public feed
  **before** disabling legacy keys — otherwise the feed will break.
- Original `notify-dashboard-signup` falls back to `SUPABASE_SERVICE_ROLE_KEY` only if
  `SUPABASE_SECRET_KEYS` is missing; fine once secret keys exist.
- Website and dashboard already use the `sb_publishable_` key (`dance-event-viewer/js/supabase-config.js`,
  `dashboard-src/src/config.ts`). A repo search for `eyJ…` tokens found no committed JWTs
  (only library code mentioning the prefix).
- Also check outside the repos: GitHub Actions secrets, Cloudflare Worker secrets, Apify/other
  integrations, local `.env` files. Dashboard → API Keys → Legacy shows last-used info if available.
