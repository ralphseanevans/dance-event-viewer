# New dashboard signup email

This server-only Supabase Edge Function emails the owner exactly once when a new Auth identity
creates its inactive `dashboard_profiles` row. It consumes INSERT webhooks from
`public.dashboard_signup_notifications`. Email delivery is asynchronous and uses Resend's
`Idempotency-Key`, so notification retries do not block signups or normally duplicate mail.

Required Edge Function secrets:

- `RESEND_API_KEY`
- `OWNER_NOTIFICATION_EMAIL` — use the same owner address as the existing intake alerts
- `SIGNUP_NOTIFICATION_FROM_EMAIL` — a sender on a Resend-verified domain
- optional `DASHBOARD_URL`

Supabase supplies `SUPABASE_URL` and its server key environment variables. Never put any of these
values in Git, SQL, the static dashboard, logs, or this file.

After secrets are configured, create a Database Webhook for INSERT on
`public.dashboard_signup_notifications`, target the `notify-dashboard-signup` Edge Function, and
use Supabase's **Add auth header with service key** option. Keep JWT verification enabled on the
function. Test with a real new Auth identity, confirm one owner email, confirm the user stays
inactive, and confirm the queue row becomes `sent`.

