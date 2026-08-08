import { createClient } from "@supabase/supabase-js";
import { dashboardConfig } from "./config";

export const supabaseClient = createClient(
  dashboardConfig.supabaseUrl,
  dashboardConfig.publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);

export const authRedirectUrl = `${window.location.origin}${window.location.pathname}`;
