import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import {
  editableFields,
  eventToForm,
  formatStringList,
  formatTime,
  formatTimeRange,
  parseStringList,
  resolveFlyerUrl,
  type EventFormState,
} from "./EventFormatting";

const PAGE_SIZE = 24;
const VIEW_MODE_KEY = "dance-dashboard-events-view";
const SHOW_FLYERS_KEY = "dance-dashboard-show-flyers";

type ViewMode = "cards" | "spreadsheet";

type FormState = EventFormState;

function FlyerPreview({ url, label, compact = false }: { url: string | null | undefined; label: string; compact?: boolean }) {
  const [broken, setBroken] = useState(false);
  const resolved = resolveFlyerUrl(url);

  useEffect(() => { setBroken(false); }, [resolved]);

  if (!resolved || broken) {
    return (
      <Box className={`flyer-placeholder${compact ? " flyer-placeholder--compact" : ""}`} role="img" aria-label={resolved ? `Flyer unavailable for ${label}` : `No flyer for ${label}`}>
        <ImageNotSupportedOutlinedIcon fontSize={compact ? "small" : "medium"} />
        {!compact && <Typography variant="caption">{resolved ? "Flyer unavailable" : "No flyer"}</Typography>}
      </Box>
    );
  }

  return <Box component="img" className={`event-flyer${compact ? " event-flyer--compact" : ""}`} src={resolved} alt={`Flyer for ${label}`} loading="lazy" onError={() => setBroken(true)} />;
}

function storedViewMode(): ViewMode {
  try { return localStorage.getItem(VIEW_MODE_KEY) === "spreadsheet" ? "spreadsheet" : "cards"; } catch { return "cards"; }
}

function storedShowFlyers(): boolean {
  try { return localStorage.getItem(SHOW_FLYERS_KEY) !== "false"; } catch { return true; }
}

export default function EventsPage({ profile }: { profile: DashboardProfile }) {
  const theme = useTheme();
  const compactDialog = useMediaQuery(theme.breakpoints.down("sm"));
  const admin = profile.role === "owner_admin" || profile.role === "volunteer_admin";
  const view = admin ? "dashboard_events_admin" : "dashboard_events";
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DashboardEvent | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(eventToForm());
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(storedViewMode);
  const [showFlyers, setShowFlyers] = useState(storedShowFlyers);

  useEffect(() => { try { localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch { /* optional preference */ } }, [viewMode]);
  useEffect(() => { try { localStorage.setItem(SHOW_FLYERS_KEY, String(showFlyers)); } catch { /* optional preference */ } }, [showFlyers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabaseClient
      .from(view)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (queryError) setError(queryError.message);
    setEvents((data as DashboardEvent[] | null) ?? []);
    setLoading(false);
  }, [view]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => [event.name, event.event_key, event.venue, event.style, event.state]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [events, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleEvents = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  function openEdit(event: DashboardEvent) {
    setEditing(event);
    setForm(eventToForm(event));
    setError("");
  }

  function openCreate() {
    setEditing(null);
    setForm(eventToForm());
    setError("");
  }

  function closeEditor() {
    if (!saving) setEditing(undefined);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const nullable = (value: string) => value.trim() || null;
    const common = {
      name: form.name.trim(),
      style: form.style.trim(),
      event_type: form.event_type,
      day_of_week: nullable(form.day_of_week),
      monthly_rule: nullable(form.monthly_rule),
      exclude_monthly_rules: parseStringList(form.exclude_monthly_rules),
      start_date: nullable(form.start_date),
      end_date: nullable(form.end_date),
      start_time: nullable(form.start_time),
      end_time: nullable(form.end_time),
      venue: form.venue.trim(),
      state: nullable(form.state),
      cost: nullable(form.cost),
      source_url: nullable(form.source_url),
      notes: form.notes,
      last_confirmed: form.last_confirmed,
      flyer_url: nullable(form.flyer_url),
      exclude_dates: parseStringList(form.exclude_dates),
    };

    if (editing) {
      const adminOnly = admin ? { record_status: form.record_status, in_wcs_list: form.in_wcs_list } : {};
      const { data, error: updateError } = await supabaseClient
        .from(view)
        .update({ ...common, ...adminOnly })
        .eq("id", editing.id)
        .eq("version", editing.version)
        .select("*")
        .maybeSingle();
      if (updateError) setError(updateError.message);
      else if (!data) setError("This record changed after you opened it. Refresh and review the newest version.");
      else {
        setEditing(undefined);
        await load();
      }
    } else if (admin) {
      const today = new Date().toISOString().slice(0, 10);
      const { error: insertError } = await supabaseClient.from(view).insert({
        ...common,
        event_key: form.event_key.trim(),
        record_status: form.record_status,
        in_wcs_list: form.in_wcs_list,
        source_type: "dashboard",
        source_detail: "owner dashboard",
        first_seen: today,
        added_to_calendar: false,
        research_confidence: "high",
      });
      if (insertError) setError(insertError.message);
      else {
        setEditing(undefined);
        await load();
      }
    }
    setSaving(false);
  }

  async function archive(event: DashboardEvent) {
    if (!admin || !window.confirm(`Archive “${event.name}”? The immutable event key will be preserved.`)) return;
    const { error: updateError } = await supabaseClient
      .from(view)
      .update({ record_status: "archived" })
      .eq("id", event.id)
      .eq("version", event.version);
    if (updateError) setError(updateError.message);
    else await load();
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="h4" component="h1">{admin ? "Events" : "Assigned events"}</Typography>
          <Typography color="text.secondary">
            {search.trim() ? `${filtered.length} matching of ${events.length} events` : `${events.length} events`}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button startIcon={<RefreshIcon />} onClick={() => void load()}>Refresh</Button>
          {admin && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add event</Button>}
        </Stack>
      </Stack>
      <TextField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name, key, venue, style, or state"
        InputProps={{ startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> }}
        fullWidth
      />
      <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }} justifyContent="space-between">
        <ToggleButtonGroup value={viewMode} exclusive onChange={(_event, next: ViewMode | null) => { if (next) setViewMode(next); }} size="small" aria-label="Event view">
          <ToggleButton value="cards" aria-label="Card view"><GridViewOutlinedIcon sx={{ mr: 1 }} />Cards</ToggleButton>
          <ToggleButton value="spreadsheet" aria-label="Spreadsheet view"><TableRowsOutlinedIcon sx={{ mr: 1 }} />Spreadsheet</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel control={<Checkbox checked={showFlyers} onChange={(event) => setShowFlyers(event.target.checked)} />} label="Show flyers" />
      </Stack>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {loading ? (
        <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box>
      ) : viewMode === "cards" ? (
        <Box className="event-grid">
          {visibleEvents.map((event) => (
            <Paper key={event.id} sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.5 }}>
              {showFlyers && <FlyerPreview url={event.flyer_url} label={event.name} />}
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                <Box minWidth={0}>
                  <Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>{event.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{event.event_key}</Typography>
                </Box>
                <Chip size="small" label={event.record_status} color={event.record_status === "active" ? "success" : "default"} />
              </Stack>
              <Typography color="text.secondary">{event.style} · {event.venue}</Typography>
              <Typography variant="body2">
                {event.start_date || event.day_of_week || event.monthly_rule || "Schedule pending"}
                {formatTimeRange(event) ? ` · ${formatTimeRange(event)}` : ""}
              </Typography>
              <Stack direction="row" gap={1} mt="auto">
                <Button startIcon={<EditOutlinedIcon />} onClick={() => openEdit(event)}>Edit</Button>
                {admin && event.record_status !== "archived" && (
                  <Button color="warning" startIcon={<ArchiveOutlinedIcon />} onClick={() => void archive(event)}>Archive</Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ maxWidth: "100%", overflowX: "auto" }}>
          <Table size="small" aria-label="Events spreadsheet">
            <TableHead><TableRow>
              {showFlyers && <TableCell>Flyer</TableCell>}
              <TableCell>Name</TableCell><TableCell>Schedule</TableCell><TableCell>Venue</TableCell><TableCell>Style</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>{visibleEvents.map((event) => (
              <TableRow key={event.id} hover>
                {showFlyers && <TableCell><FlyerPreview url={event.flyer_url} label={event.name} compact /></TableCell>}
                <TableCell><Typography fontWeight={750}>{event.name}</Typography><Typography variant="caption" color="text.secondary">{event.event_key}</Typography></TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{event.start_date || event.day_of_week || event.monthly_rule || "Pending"}{formatTimeRange(event) ? ` · ${formatTimeRange(event)}` : ""}</TableCell>
                <TableCell>{event.venue}</TableCell><TableCell>{event.style}</TableCell>
                <TableCell><Chip size="small" label={event.record_status} color={event.record_status === "active" ? "success" : "default"} /></TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Button startIcon={<EditOutlinedIcon />} onClick={() => openEdit(event)}>Edit</Button>
                  {admin && event.record_status !== "archived" && <Button color="warning" onClick={() => void archive(event)}>Archive</Button>}
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </TableContainer>
      )}
      {!loading && pageCount > 1 && (
        <Stack direction="row" justifyContent="center">
          <Pagination
            page={page}
            count={pageCount}
            onChange={(_event, nextPage) => setPage(nextPage)}
            color="primary"
            showFirstButton
            showLastButton
            aria-label="Event pages"
          />
        </Stack>
      )}
      <Dialog open={editing !== undefined} onClose={closeEditor} fullWidth maxWidth="md" fullScreen={compactDialog}>
        <Box component="form" onSubmit={save}>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "Add event"}</DialogTitle>
          <DialogContent dividers>
            <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "1fr 1fr" }} gap={2} pt={1}>
              {!editing && admin && (
                <TextField label="Immutable event key" value={form.event_key} required onChange={(e) => setForm({ ...form, event_key: e.target.value })} />
              )}
              <TextField label="Name" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <TextField label="Style" value={form.style} required onChange={(e) => setForm({ ...form, style: e.target.value })} />
              <FormControl>
                <InputLabel id="event-type-label">Event type</InputLabel>
                <Select labelId="event-type-label" label="Event type" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
                  <MenuItem value="one_time">One time</MenuItem>
                  <MenuItem value="weekly_recurring">Weekly recurring</MenuItem>
                  <MenuItem value="monthly_recurring">Monthly recurring</MenuItem>
                  <MenuItem value="tentative">Tentative</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Day of week" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })} />
              <TextField label="Monthly rule" value={form.monthly_rule} onChange={(e) => setForm({ ...form, monthly_rule: e.target.value })} />
              <TextField
                label="Excluded monthly rules"
                value={form.exclude_monthly_rules}
                placeholder="First Friday, Third Saturday"
                helperText="Comma-separated rules"
                onChange={(e) => setForm({ ...form, exclude_monthly_rules: e.target.value })}
              />
              <TextField label="Start date" value={form.start_date} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              <TextField label="End date" value={form.end_date} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              <TextField
                label="Excluded dates"
                value={form.exclude_dates}
                placeholder="2026-12-25, 2027-01-01"
                helperText="Comma-separated YYYY-MM-DD dates"
                onChange={(e) => setForm({ ...form, exclude_dates: e.target.value })}
                sx={{ gridColumn: { sm: "1 / -1" } }}
              />
              <TextField label="Start time" value={form.start_time} placeholder="7:00 PM" onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <TextField label="End time" value={form.end_time} placeholder="10:00 PM" onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              <TextField label="Venue" value={form.venue} required onChange={(e) => setForm({ ...form, venue: e.target.value })} />
              <TextField label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              <TextField label="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              <TextField label="Last confirmed" value={form.last_confirmed} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, last_confirmed: e.target.value })} />
              <TextField label="Source URL" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
              <TextField label="Flyer URL" value={form.flyer_url} onChange={(e) => setForm({ ...form, flyer_url: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
              <Box sx={{ gridColumn: { sm: "1 / -1" }, maxWidth: 360 }}>
                <Typography variant="caption" color="text.secondary">Flyer preview</Typography>
                <Box sx={{ mt: 0.75 }}><FlyerPreview url={form.flyer_url} label={form.name || "this event"} /></Box>
              </Box>
              <TextField label="Notes" value={form.notes} multiline minRows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
              {admin && (
                <FormControl>
                  <InputLabel id="record-status-label">Record status</InputLabel>
                  <Select labelId="record-status-label" label="Record status" value={form.record_status} onChange={(e) => setForm({ ...form, record_status: e.target.value })}>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="draft">Draft</MenuItem>
                    <MenuItem value="archived">Archived</MenuItem>
                  </Select>
                </FormControl>
              )}
              {admin && (
                <FormControlLabel
                  control={(
                    <Switch
                      checked={form.in_wcs_list}
                      onChange={(event) => setForm({ ...form, in_wcs_list: event.target.checked })}
                    />
                  )}
                  label="Include in West Coast Swing views and calendar"
                  sx={{ alignSelf: "center" }}
                />
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving || !form.name.trim() || !form.venue.trim()}>
              {saving ? "Saving…" : "Save event"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
