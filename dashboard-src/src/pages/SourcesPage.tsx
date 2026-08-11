import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Chip, Link, Pagination, Paper, Stack, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { DashboardProfile, SourceHistoryEntry } from "../types";
import { supabaseClient } from "../supabase";
import { isAdmin, rowsOf } from "../lib/queries";
import { filterByText, usePagedList } from "../lib/usePagedList";

export default function SourcesPage({ profile }: { profile: DashboardProfile }) {
  const [entries, setEntries] = useState<SourceHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const view = isAdmin(profile) ? "dashboard_source_history_admin" : "dashboard_source_history";

  useEffect(() => {
    void supabaseClient.from(view).select("*").order("last_seen", { ascending: false }).limit(1000)
      .then((result) => {
        if (result.error) setError(result.error.message);
        setEntries(rowsOf<SourceHistoryEntry>(result));
      });
  }, [view]);

  const filtered = useMemo(
    () => filterByText(entries, search, (entry) => [entry.source_detail, entry.source_type, entry.source_skill, entry.source_url]),
    [entries, search],
  );
  const { page, setPage, pageCount, visibleItems: visibleEntries } = usePagedList(filtered);

  useEffect(() => { setPage(1); }, [search, setPage]);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">Source history</Typography>
        <Typography color="text.secondary">Crawler observations are retained as evidence instead of overwritten.</Typography>
        <Typography variant="body2" color="text.secondary">
          {search.trim() ? `${filtered.length} matching of ${entries.length} observations` : `${entries.length} observations`}
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search source, type, skill, or URL"
        InputProps={{ startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> }}
        fullWidth
      />
      <Box className="event-grid">
        {visibleEntries.map((entry) => (
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
      {!filtered.length && <Typography color="text.secondary">No matching source observations.</Typography>}
      {pageCount > 1 && (
        <Stack direction="row" justifyContent="center">
          <Pagination
            page={page}
            count={pageCount}
            onChange={(_event, nextPage) => setPage(nextPage)}
            color="primary"
            showFirstButton
            showLastButton
            aria-label="Source history pages"
          />
        </Stack>
      )}
    </Stack>
  );
}
