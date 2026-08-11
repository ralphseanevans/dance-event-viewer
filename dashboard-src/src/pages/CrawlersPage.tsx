import { useEffect, useState } from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import { rowsOf } from "../lib/queries";

interface CrawlerRun {
  id: string;
  crawler_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  discovered_count: number;
  changed_count: number;
  correlation_id: string | null;
}

export default function CrawlersPage({ profile: _profile }: { profile: DashboardProfile }) {
  const [runs, setRuns] = useState<CrawlerRun[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void supabaseClient.from("dashboard_crawler_runs").select("*").order("started_at", { ascending: false }).limit(200)
      .then((result) => {
        if (result.error) setError(result.error.message);
        setRuns(rowsOf<CrawlerRun>(result));
      });
  }, []);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">Crawler runs</Typography>
        <Typography color="text.secondary">Reserved for authenticated scanner run summaries and diagnostics.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1.25}>
        {runs.map((run) => (
          <Paper key={run.id} sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
              <Box>
                <Typography fontWeight={800}>{run.crawler_name}</Typography>
                <Typography variant="body2" color="text.secondary">{run.discovered_count} discovered · {run.changed_count} changed</Typography>
              </Box>
              <Stack alignItems={{ sm: "flex-end" }} gap={0.5}>
                <Chip size="small" label={run.status} color={run.status === "succeeded" ? "success" : "default"} />
                <Typography variant="caption" color="text.secondary">{new Date(run.started_at).toLocaleString()}</Typography>
              </Stack>
            </Stack>
          </Paper>
        ))}
        {!runs.length && <Typography color="text.secondary">No Supabase crawler runs have been recorded yet.</Typography>}
      </Stack>
    </Stack>
  );
}
