/* Public browser configuration only. Publishable keys are safe to expose with RLS enabled. */
window.DANCE_EVENT_VIEWER_SUPABASE = Object.freeze({
  enabled: true,
  url: "https://xyyxbwetagfexsqtokpk.supabase.co",
  publishableKey: "sb_publishable_83vWaWTwt8TL0qGIFb-VGg_560kYbJu",
  table: "event_listings",
  /* UI-only admin flag (cosmetic). Real write permission is enforced by Supabase RLS
     (private.is_owner_admin() via public.dashboard_profiles). */
  adminEmails: ["ralphseanevans@gmail.com"]
});
window.ADMIN_EMAILS = window.DANCE_EVENT_VIEWER_SUPABASE.adminEmails;
