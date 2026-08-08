import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Box, CircularProgress } from "@mui/material";
import { supabaseClient } from "./supabase";
import type { DashboardProfile } from "./types";
import LoginScreen from "./components/LoginScreen";
import PendingAccess from "./components/PendingAccess";
import DashboardShell from "./components/DashboardShell";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<DashboardProfile | null | undefined>(undefined);

  useEffect(() => {
    void supabaseClient.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

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
      .then(({ data }) => setProfile((data as DashboardProfile | null) ?? null));
  }, [session]);

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
