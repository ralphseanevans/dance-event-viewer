import { useEffect, useState } from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { ActivityEntry, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";

export default function ActivityPage({ profile }: { profile: DashboardProfile }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const view = profile.role === "owner_admin" ? "dashboard_activity_admin" : "dashboard_activity";
    void supabaseClient.from(view).select("*").order("occurred_at", { ascending: false }).limit(250)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        setEntries((data as ActivityEntry[] | null) ?? []);
      });
  }, [profile.role]);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">Activity</Typography>
        <Typography color="text.secondary">Append-only database history. Volunteers see activity only for assigned events.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1.25}>
        {entries.map((entry) => (
          <Paper key={entry.id} sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
              <Box>
                <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                  <Typography fontWeight={800}>{entry.action}</Typography>
                  <Chip size="small" label={entry.entity_type} />
                  <Chip size="small" variant="outlined" label={entry.actor_kind} />
                </Stack>
                <Typography variant="body2" color="text.secondary" mt={0.75}>
                  Changed: {entry.changed_fields?.join(", ") || "record lifecycle"}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">{new Date(entry.occurred_at).toLocaleString()}</Typography>
            </Stack>
          </Paper>
        ))}
        {!entries.length && <Typography color="text.secondary">No visible dashboard activity yet.</Typography>}
      </Stack>
    </Stack>
  );
}
