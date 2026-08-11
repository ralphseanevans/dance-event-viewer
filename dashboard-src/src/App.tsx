import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { supabaseClient } from "./supabase";
import type { DashboardProfile } from "./types";
import LoginScreen from "./components/LoginScreen";
import PendingAccess from "./components/PendingAccess";
import DashboardShell from "./components/DashboardShell";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<DashboardProfile | null | undefined>(undefined);
  // A failed session or profile lookup used to be indistinguishable from "no account yet",
  // so a network or RLS failure showed the awaiting-approval screen to an approved user.
  const [loadError, setLoadError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setLoadError("");
    setSession(undefined);
    setProfile(undefined);
    setRetryToken((token) => token + 1);
  }, []);

  useEffect(() => {
    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) setLoadError(error.message);
      setSession(data.session);
    });
    const { data } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setLoadError("");
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [retryToken]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setProfile(undefined);
    void supabaseClient
      .from("dashboard_profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        setProfile((data as DashboardProfile | null) ?? null);
      });
  }, [session, retryToken]);

  if (loadError) {
    return (
      <Box minHeight="100dvh" display="grid" sx={{ placeItems: "center", p: 3 }}>
        <Stack spacing={2} maxWidth={520}>
          <Typography variant="h6" fontWeight={850}>The dashboard could not confirm your access</Typography>
          <Alert severity="error">{loadError}</Alert>
          <Typography variant="body2" color="text.secondary">
            Your account status is unknown rather than denied — nothing was changed. Try again once the connection recovers.
          </Typography>
          <Button variant="contained" onClick={retry}>Try again</Button>
        </Stack>
      </Box>
    );
  }

  if (session === undefined || (session && profile === undefined)) {
    return (
      <Box minHeight="100dvh" display="grid" sx={{ placeItems: "center" }}>
        <CircularProgress aria-label="Loading dashboard" />
      </Box>
    );
  }

  if (!session) return <LoginScreen />;
  if (!profile?.active) return <PendingAccess email={session.user.email ?? "this account"} />;
  return <DashboardShell session={session} profile={profile} />;
}
