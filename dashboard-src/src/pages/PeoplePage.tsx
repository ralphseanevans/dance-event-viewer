import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import type { DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";

export default function PeoplePage({ profile }: { profile: DashboardProfile }) {
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabaseClient
      .from("dashboard_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    setProfiles((data as DashboardProfile[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setActive(target: DashboardProfile, active: boolean) {
    setError("");
    const { error: updateError } = await supabaseClient
      .from("dashboard_profiles")
      .update({ active })
      .eq("id", target.id);
    if (updateError) setError(updateError.message);
    else await load();
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">People</Typography>
        <Typography color="text.secondary">Activate volunteers after confirming their identity. New sign-ins start inactive.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? <CircularProgress /> : (
        <Stack spacing={1.5}>
          {profiles.map((person) => (
            <Paper key={person.id} sx={{ p: 2.25 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2}>
                <Box minWidth={0}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={750} sx={{ overflowWrap: "anywhere" }}>{person.display_name || person.email}</Typography>
                    <Chip size="small" label={person.role === "owner_admin" ? "Owner admin" : "Volunteer"} color={person.role === "owner_admin" ? "primary" : "default"} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{person.email}</Typography>
                </Box>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography variant="body2" color="text.secondary">{person.active ? "Active" : "Inactive"}</Typography>
                  <Switch
                    checked={person.active}
                    disabled={person.id === profile.id || person.role === "owner_admin"}
                    onChange={(event) => void setActive(person, event.target.checked)}
                    inputProps={{ "aria-label": `${person.active ? "Deactivate" : "Activate"} ${person.email}` }}
                  />
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
