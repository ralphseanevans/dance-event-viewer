import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Chip, Link, Pagination, Paper, Stack, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { DashboardProfile, SourceHistoryEntry } from "../types";
import { supabaseClient } from "../supabase";

const PAGE_SIZE = 24;

export default function SourcesPage({ profile }: { profile: DashboardProfile }) {
  const [entries, setEntries] = useState<SourceHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const view = profile.role === "owner_admin" || profile.role === "volunteer_admin" ? "dashboard_source_history_admin" : "dashboard_source_history";
    void supabaseClient.from(view).select("*").order("last_seen", { ascending: false }).limit(1000)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        setEntries((data as SourceHistoryEntry[] | null) ?? []);
      });
  }, [profile.role]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => [entry.source_detail, entry.source_type, entry.source_skill, entry.source_url]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [entries, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleEntries = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

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
