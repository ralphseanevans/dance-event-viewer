import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, Divider, FormControl, InputLabel,
  MenuItem, Paper, Select, Stack, TextField, Typography,
} from "@mui/material";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import DataQualityInbox from "./DataQualityInbox";
import ExperimentStatus from "./ExperimentStatus";
import DraftReviewExperiment from "./DraftReviewExperiment";
import VolunteerPreviewExperiment from "./VolunteerPreviewExperiment";

interface SeriesDraft {
  id: string; series_code: string; name: string; series_type: "recurring" | "occasional" | "one_off";
  primary_owner_profile_id: string | null; notes: string; draft_status: "draft" | "ready" | "archived";
  created_by: string; created_at: string; updated_at: string;
}
interface EventLink { series_id: string; event_id: string; }
interface ManagerLink { series_id: string; user_id: string; }
interface AssignmentLink { id: string; event_id: string; user_id: string; assigned_by: string | null; active: boolean; assigned_at: string; ended_at: string | null; note: string | null; }

export default function ExperimentalPage({ profile }: { profile: DashboardProfile }) {
  const [series, setSeries] = useState<SeriesDraft[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [people, setPeople] = useState<DashboardProfile[]>([]);
  const [eventLinks, setEventLinks] = useState<EventLink[]>([]);
  const [managerLinks, setManagerLinks] = useState<ManagerLink[]>([]);
  const [assignments, setAssignments] = useState<AssignmentLink[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<DashboardEvent | null>(null);
  const [selectedManager, setSelectedManager] = useState<DashboardProfile | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [seriesType, setSeriesType] = useState<SeriesDraft["series_type"]>("recurring");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [seriesResult, eventsResult, peopleResult, eventLinksResult, managersResult, assignmentsResult] = await Promise.all([
      supabaseClient.from("experimental_series_drafts").select("*").order("updated_at", { ascending: false }),
      supabaseClient.from("dashboard_events_admin").select("*").order("name").limit(1000),
      supabaseClient.from("dashboard_profiles").select("*").order("display_name").limit(1000),
      supabaseClient.from("experimental_series_event_links").select("series_id,event_id"),
      supabaseClient.from("experimental_series_managers").select("series_id,user_id"),
      supabaseClient.from("event_assignments").select("*").eq("active", true),
    ]);
    const firstError = [seriesResult, eventsResult, peopleResult, eventLinksResult, managersResult, assignmentsResult].find(result => result.error)?.error;
    if (firstError) setError(firstError.message);
    setSeries((seriesResult.data as SeriesDraft[] | null) ?? []);
    setEvents((eventsResult.data as DashboardEvent[] | null) ?? []);
    setPeople((peopleResult.data as DashboardProfile[] | null) ?? []);
    setEventLinks((eventLinksResult.data as EventLink[] | null) ?? []);
    setManagerLinks((managersResult.data as ManagerLink[] | null) ?? []);
    setAssignments((assignmentsResult.data as AssignmentLink[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!selectedSeriesId && series[0]) setSelectedSeriesId(series[0].id); }, [selectedSeriesId, series]);

  const selectedSeries = series.find(item => item.id === selectedSeriesId) ?? null;
  const linkedEvents = useMemo(() => new Set(eventLinks.filter(link => link.series_id === selectedSeriesId).map(link => link.event_id)), [eventLinks, selectedSeriesId]);
  const linkedManagers = useMemo(() => new Set(managerLinks.filter(link => link.series_id === selectedSeriesId).map(link => link.user_id)), [managerLinks, selectedSeriesId]);

  async function createSeries(event: FormEvent) {
    event.preventDefault(); setError("");
    const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const { error: insertError } = await supabaseClient.from("experimental_series_drafts").insert({
      series_code: normalizedCode, name: name.trim(), series_type: seriesType,
      primary_owner_profile_id: ownerId || null, created_by: profile.id,
    });
    if (insertError) setError(insertError.message);
    else { setName(""); setCode(""); setOwnerId(""); await load(); }
  }

  async function linkEvent() {
    if (!selectedSeries || !selectedEvent) return;
    const { error: insertError } = await supabaseClient.from("experimental_series_event_links").insert({
      series_id: selectedSeries.id, event_id: selectedEvent.id, created_by: profile.id,
    });
    if (insertError) setError(insertError.message); else { setSelectedEvent(null); await load(); }
  }

  async function addManager() {
    if (!selectedSeries || !selectedManager) return;
    const { error: insertError } = await supabaseClient.from("experimental_series_managers").insert({
      series_id: selectedSeries.id, user_id: selectedManager.id, created_by: profile.id,
    });
    if (insertError) setError(insertError.message); else { setSelectedManager(null); await load(); }
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><ScienceOutlinedIcon color="secondary" /><Typography variant="h4" component="h1">Experimental Dashboard</Typography><Chip label="Beta" color="secondary" size="small" /><ExperimentStatus status="live" /></Stack>
        <Typography color="text.secondary">Owner-only draft workspace. Nothing here changes public listings or grants real permissions.</Typography>
      </Box>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      <Paper component="form" onSubmit={createSeries} sx={{ p: 2.5 }}>
        <Typography variant="h6" gutterBottom>Create a draft event series</Typography>
        <Stack direction={{ xs: "column", md: "row" }} gap={1.5}>
          <TextField label="Series name" value={name} required onChange={event => setName(event.target.value)} fullWidth />
          <TextField label="Memorable code" value={code} required placeholder="JIVE-1042" onChange={event => setCode(event.target.value)} fullWidth />
          <FormControl fullWidth><InputLabel id="series-type-label">Type</InputLabel><Select labelId="series-type-label" label="Type" value={seriesType} onChange={event => setSeriesType(event.target.value as SeriesDraft["series_type"])}><MenuItem value="recurring">Recurring</MenuItem><MenuItem value="occasional">Occasional</MenuItem><MenuItem value="one_off">One-off</MenuItem></Select></FormControl>
          <FormControl fullWidth><InputLabel id="owner-label">Primary owner</InputLabel><Select labelId="owner-label" label="Primary owner" value={ownerId} onChange={event => setOwnerId(event.target.value)}><MenuItem value="">Unassigned</MenuItem>{people.map(person => <MenuItem key={person.id} value={person.id}>{person.display_name || person.email}</MenuItem>)}</Select></FormControl>
          <Button type="submit" variant="contained" disabled={!name.trim() || !code.trim()}>Create draft</Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" gutterBottom>Test relationships</Typography>
        <FormControl fullWidth sx={{ mb: 2 }}><InputLabel id="draft-series-label">Draft series</InputLabel><Select labelId="draft-series-label" label="Draft series" value={selectedSeriesId} onChange={event => setSelectedSeriesId(event.target.value)}>{series.map(item => <MenuItem key={item.id} value={item.id}>{item.series_code} — {item.name}</MenuItem>)}</Select></FormControl>
        {loading ? <Typography color="text.secondary">Loading drafts…</Typography> : !selectedSeries ? <Typography color="text.secondary">Create a draft series to begin.</Typography> : (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.5}><Autocomplete fullWidth options={events.filter(item => !linkedEvents.has(item.id))} value={selectedEvent} onChange={(_event, value) => setSelectedEvent(value)} getOptionLabel={item => `${item.name} — ${item.venue}`} renderInput={params => <TextField {...params} label="Link an existing event" />} /><Button variant="outlined" disabled={!selectedEvent} onClick={() => void linkEvent()}>Link event</Button></Stack>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.5}><Autocomplete fullWidth options={people.filter(item => !linkedManagers.has(item.id))} value={selectedManager} onChange={(_event, value) => setSelectedManager(value)} getOptionLabel={item => item.display_name || item.email} renderInput={params => <TextField {...params} label="Who manages this?" />} /><Button variant="outlined" disabled={!selectedManager} onClick={() => void addManager()}>Add manager</Button></Stack>
            <Divider />
            <Box><Typography fontWeight={800}>Linked events ({linkedEvents.size})</Typography><Stack direction="row" gap={1} flexWrap="wrap" mt={1}>{events.filter(item => linkedEvents.has(item.id)).map(item => <Chip key={item.id} label={item.name} />)}</Stack></Box>
            <Box><Typography fontWeight={800}>Draft managers ({linkedManagers.size})</Typography><Stack direction="row" gap={1} flexWrap="wrap" mt={1}>{people.filter(item => linkedManagers.has(item.id)).map(item => <Chip key={item.id} label={item.display_name || item.email} />)}</Stack></Box>
          </Stack>
        )}
      </Paper>
      <DataQualityInbox events={events} profile={profile} />
      <DraftReviewExperiment events={events} profile={profile} />
      <VolunteerPreviewExperiment events={events} people={people} assignments={assignments} />
    </Stack>
  );
}
