import { createHandler } from './feed.mjs';
// Public read-only feed explicitly requested by Sean. Uses anon RLS via the
// publishable key (sb_publishable_*), never service_role or the legacy anon JWT.
// Publishable keys are not JWTs, so they go only in the apikey header.
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_83vWaWTwt8TL0qGIFb-VGg_560kYbJu"; // public value, same as dance-event-viewer/js/supabase-config.js

function getPublishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    try {
      const value = (JSON.parse(keys) as Record<string, string>).default;
      if (value) return value;
    } catch {
      // fall through
    }
  }
  return FALLBACK_PUBLISHABLE_KEY;
}

Deno.serve(createHandler({ url: Deno.env.get('SUPABASE_URL'), publishableKey: getPublishableKey() }));
