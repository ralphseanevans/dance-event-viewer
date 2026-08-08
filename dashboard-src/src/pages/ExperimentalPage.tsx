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
  const [searchQuery, setSearchQuery] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const styles = useMemo(() => [...new Set(events.map(item => item.style).filter(Boolean))].sort(), [events]);
  const states = useMemo(() => [...new Set(events.map(item => item.state).filter((value): value is string => Boolean(value)))].sort(), [events]);
  const days = useMemo(() => [...new Set(events.map(item => item.day_of_week).filter((value): value is string => Boolean(value)))].sort(), [events]);
  const filteredEvents = useMemo(() => {
    return events.filter(item => {
      const matchesSearch = !normalizedSearch || [
        item.name, item.event_key, item.style, item.venue, item.state,
        item.day_of_week, item.monthly_rule,
      ].some(value => String(value ?? "").toLowerCase().includes(normalizedSearch));
      return matchesSearch
        && (!styleFilter || item.style === styleFilter)
        && (!stateFilter || item.state === stateFilter)
        && (!dayFilter || item.day_of_week === dayFilter)
        && (!typeFilter || item.event_type === typeFilter)
        && (!statusFilter || item.record_status === statusFilter);
    });
  }, [events, normalizedSearch, styleFilter, stateFilter, dayFilter, typeFilter, statusFilter]);
  const filteredSeries = useMemo(() => {
    if (!normalizedSearch) return series;
    return series.filter(item => `${item.series_code} ${item.name}`.toLowerCase().includes(normalizedSearch));
  }, [series, normalizedSearch]);

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
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" gutterBottom>Find dances</Typography>
        <TextField
          label="Search dances"
          placeholder="Name, series code, venue, location, style, or event key"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          fullWidth
        />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" }, gap: 1.5, mt: 1.5 }}>
          <FormControl fullWidth><InputLabel id="experimental-style-filter-label">Style</InputLabel><Select labelId="experimental-style-filter-label" label="Style" value={styleFilter} onChange={event => setStyleFilter(event.target.value)}><MenuItem value="">All styles</MenuItem>{styles.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
          <FormControl fullWidth><InputLabel id="experimental-state-filter-label">State</InputLabel><Select labelId="experimental-state-filter-label" label="State" value={stateFilter} onChange={event => setStateFilter(event.target.value)}><MenuItem value="">All states</MenuItem>{states.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
          <FormControl fullWidth><InputLabel id="experimental-day-filter-label">Day</InputLabel><Select labelId="experimental-day-filter-label" label="Day" value={dayFilter} onChange={event => setDayFilter(event.target.value)}><MenuItem value="">All days</MenuItem>{days.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
          <FormControl fullWidth><InputLabel id="experimental-type-filter-label">Event type</InputLabel><Select labelId="experimental-type-filter-label" label="Event type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><MenuItem value="">All types</MenuItem><MenuItem value="one_time">One-time</MenuItem><MenuItem value="weekly_recurring">Weekly recurring</MenuItem><MenuItem value="monthly_recurring">Monthly recurring</MenuItem><MenuItem value="tentative">Tentative</MenuItem></Select></FormControl>
          <FormControl fullWidth><InputLabel id="experimental-status-filter-label">Status</InputLabel><Select labelId="experimental-status-filter-label" label="Status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><MenuItem value="">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="draft">Draft</MenuItem><MenuItem value="archived">Archived</MenuItem></Select></FormControl>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1} mt={1}>
          <Typography variant="caption" color="text.secondary">
            {`${filteredEvents.length} matching of ${events.length} events; ${filteredSeries.length} matching series`}
          </Typography>
          <Button size="small" onClick={() => { setSearchQuery(""); setStyleFilter(""); setStateFilter(""); setDayFilter(""); setTypeFilter(""); setStatusFilter(""); }}>Clear filters</Button>
        </Stack>
      </Paper>
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
        <FormControl fullWidth sx={{ mb: 2 }}><InputLabel id="draft-series-label">Draft series</InputLabel><Select labelId="draft-series-label" label="Draft series" value={selectedSeriesId} onChange={event => setSelectedSeriesId(event.target.value)}>{filteredSeries.map(item => <MenuItem key={item.id} value={item.id}>{item.series_code} — {item.name}</MenuItem>)}</Select></FormControl>
        {loading ? <Typography color="text.secondary">Loading drafts…</Typography> : !selectedSeries ? <Typography color="text.secondary">Create a draft series to begin.</Typography> : (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.5}><Autocomplete fullWidth options={filteredEvents.filter(item => !linkedEvents.has(item.id))} value={selectedEvent} onChange={(_event, value) => setSelectedEvent(value)} getOptionLabel={item => `${item.name} — ${item.venue}`} renderInput={params => <TextField {...params} label="Link an existing event" />} /><Button variant="outlined" disabled={!selectedEvent} onClick={() => void linkEvent()}>Link event</Button></Stack>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.5}><Autocomplete fullWidth options={people.filter(item => !linkedManagers.has(item.id))} value={selectedManager} onChange={(_event, value) => setSelectedManager(value)} getOptionLabel={item => item.display_name || item.email} renderInput={params => <TextField {...params} label="Who manages this?" />} /><Button variant="outlined" disabled={!selectedManager} onClick={() => void addManager()}>Add manager</Button></Stack>
            <Divider />
            <Box><Typography fontWeight={800}>Linked events ({linkedEvents.size})</Typography><Stack direction="row" gap={1} flexWrap="wrap" mt={1}>{events.filter(item => linkedEvents.has(item.id)).map(item => <Chip key={item.id} label={item.name} />)}</Stack></Box>
            <Box><Typography fontWeight={800}>Draft managers ({linkedManagers.size})</Typography><Stack direction="row" gap={1} flexWrap="wrap" mt={1}>{people.filter(item => linkedManagers.has(item.id)).map(item => <Chip key={item.id} label={item.display_name || item.email} />)}</Stack></Box>
          </Stack>
        )}
      </Paper>
      <DataQualityInbox events={filteredEvents} profile={profile} />
      <DraftReviewExperiment events={filteredEvents} profile={profile} />
      <VolunteerPreviewExperiment events={filteredEvents} people={people} assignments={assignments} />
    </Stack>
  );
}
