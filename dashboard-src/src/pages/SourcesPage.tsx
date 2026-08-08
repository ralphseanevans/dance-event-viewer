import { useEffect, useState } from "react";
import { Alert, Box, Chip, Link, Paper, Stack, Typography } from "@mui/material";
import type { DashboardProfile, SourceHistoryEntry } from "../types";
import { supabaseClient } from "../supabase";

export default function SourcesPage({ profile }: { profile: DashboardProfile }) {
  const [entries, setEntries] = useState<SourceHistoryEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const view = profile.role === "owner_admin" ? "dashboard_source_history_admin" : "dashboard_source_history";
    void supabaseClient.from(view).select("*").order("last_seen", { ascending: false }).limit(500)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        setEntries((data as SourceHistoryEntry[] | null) ?? []);
      });
  }, [profile.role]);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">Source history</Typography>
        <Typography color="text.secondary">Crawler observations are retained as evidence instead of overwritten.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Box className="event-grid">
        {entries.map((entry) => (
          <Paper key={entry.id} sx={{ p: 2.25 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" justifyContent="space-between" gap={1}>
                <Typography fontWeight={800}>{entry.source_detail}</Typography>
                <Chip size="small" label={entry.review_status} color={entry.review_status === "accepted" ? "success" : "default"} />
              </Stack>
              <Typography variant="body2" color="text.secondary">{entry.source_type} · {entry.source_skill || "manual"}</Typography>
              {entry.source_url && <Link href={entry.source_url} target="_blank" rel="noopener" sx={{ overflowWrap: "anywhere" }}>Open source</Link>}
              <Typography variant="caption" color="text.secondary">Last seen {new Date(entry.last_seen).toLocaleDateString()}</Typography>
            </Stack>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
