import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";

const editableFields = [
  "name", "style", "event_type", "day_of_week", "monthly_rule", "start_date", "end_date",
  "start_time", "end_time", "venue", "state", "cost", "source_url", "notes", "last_confirmed", "flyer_url",
] as const;

type FormState = Record<(typeof editableFields)[number], string> & { event_key: string; record_status: string; in_wcs_list: boolean };

function eventToForm(event?: DashboardEvent | null): FormState {
  return {
    event_key: event?.event_key ?? "",
    name: event?.name ?? "",
    style: event?.style ?? "West Coast Swing",
    event_type: event?.event_type ?? "one_time",
    day_of_week: event?.day_of_week ?? "",
    monthly_rule: event?.monthly_rule ?? "",
    start_date: event?.start_date ?? "",
    end_date: event?.end_date ?? "",
    start_time: event?.start_time ?? "",
    end_time: event?.end_time ?? "",
    venue: event?.venue ?? "",
    state: event?.state ?? "",
    cost: event?.cost ?? "",
    source_url: event?.source_url ?? "",
    notes: event?.notes ?? "",
    last_confirmed: event?.last_confirmed ?? new Date().toISOString().slice(0, 10),
    flyer_url: event?.flyer_url ?? "",
    record_status: event?.record_status ?? "draft",
    in_wcs_list: event?.in_wcs_list ?? false,
  };
}

export default function EventsPage({ profile }: { profile: DashboardProfile }) {
  const theme = useTheme();
  const compactDialog = useMediaQuery(theme.breakpoints.down("sm"));
  const admin = profile.role === "owner_admin";
  const view = admin ? "dashboard_events_admin" : "dashboard_events";
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DashboardEvent | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(eventToForm());
  const [saving, setSaving] = useState(false);

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
          <Typography variant="h4" component="h1">{admin ? "Event records" : "Assigned events"}</Typography>
          <Typography color="text.secondary">{filtered.length} visible records</Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button startIcon={<RefreshIcon />} onClick={() => void load()}>Refresh</Button>
          {admin && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add record</Button>}
        </Stack>
      </Stack>
      <TextField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name, key, venue, style, or state"
        InputProps={{ startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> }}
        fullWidth
      />
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {loading ? (
        <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box>
      ) : (
        <Box className="event-grid">
          {filtered.map((event) => (
            <Paper key={event.id} sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.5 }}>
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
                {event.start_time ? ` · ${event.start_time}` : ""}
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
      )}
      <Dialog open={editing !== undefined} onClose={closeEditor} fullWidth maxWidth="md" fullScreen={compactDialog}>
        <Box component="form" onSubmit={save}>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "Add event record"}</DialogTitle>
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
              <TextField label="Start date" value={form.start_date} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              <TextField label="End date" value={form.end_date} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              <TextField label="Start time" value={form.start_time} placeholder="7:00 PM" onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <TextField label="End time" value={form.end_time} placeholder="10:00 PM" onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              <TextField label="Venue" value={form.venue} required onChange={(e) => setForm({ ...form, venue: e.target.value })} />
              <TextField label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              <TextField label="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              <TextField label="Last confirmed" value={form.last_confirmed} placeholder="YYYY-MM-DD" onChange={(e) => setForm({ ...form, last_confirmed: e.target.value })} />
              <TextField label="Source URL" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
              <TextField label="Flyer URL" value={form.flyer_url} onChange={(e) => setForm({ ...form, flyer_url: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
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
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving || !form.name.trim() || !form.venue.trim()}>
              {saving ? "Saving…" : "Save record"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
