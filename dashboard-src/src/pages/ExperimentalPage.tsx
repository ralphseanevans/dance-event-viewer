import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, FormControl, FormControlLabel,
  FormHelperText, InputLabel, MenuItem, Pagination, Paper, Select, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import DataQualityInbox from "./DataQualityInbox";
import ExperimentStatus from "./ExperimentStatus";
import DraftReviewExperiment from "./DraftReviewExperiment";
import VolunteerPreviewExperiment from "./VolunteerPreviewExperiment";

interface SeriesDraft {
  id: string; series_code: string; name: string; series_type: "recurring" | "occasional" | "one_off";
  primary_owner_profile_id: string | null; primary_owner_draft_id: string | null; notes: string; draft_status: "draft" | "ready" | "archived";
  created_by: string; created_at: string; updated_at: string;
}
interface OwnerDraft { id: string; display_name: string; linked_profile_id: string | null; }
interface EventLink { series_id: string; event_id: string; }
interface AssignmentLink { id: string; event_id: string; user_id: string; assigned_by: string | null; active: boolean; assigned_at: string; ended_at: string | null; note: string | null; }
interface BulkSeriesRow { name: string; code: string; seriesType: SeriesDraft["series_type"]; ownerId: string; }
type SaveState = { state: "saving" | "saved" | "error"; message: string };
type LinkFilter = "all" | "needs_review" | "unlinked" | "unassigned" | "complete";
type RelationshipState = Exclude<LinkFilter, "all">;

const PAGE_SIZE = 24;
const emptyBulkRow = (): BulkSeriesRow => ({ name: "", code: "", seriesType: "recurring", ownerId: "" });

function ownerValue(series: SeriesDraft | null | undefined): string {
  if (series?.primary_owner_draft_id) return `draft:${series.primary_owner_draft_id}`;
  if (series?.primary_owner_profile_id) return `profile:${series.primary_owner_profile_id}`;
  return "";
}

function formatDate(event: DashboardEvent): string {
  if (event.start_date) {
    const parsed = new Date(`${event.start_date}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
  }
  return event.day_of_week || event.monthly_rule || "Schedule pending";
}

function resolveFlyerUrl(value: string | null | undefined): string {
  const url = value?.trim();
  if (!url || typeof window === "undefined") return url ?? "";
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  return new URL(url, new URL("../", window.location.href)).href;
}

function EventFlyer({ event }: { event: DashboardEvent }) {
  const [broken, setBroken] = useState(false);
  const url = resolveFlyerUrl(event.flyer_url);
  useEffect(() => { setBroken(false); }, [url]);
  if (!url || broken) {
    return (
      <Box role="img" aria-label={url ? `Flyer unavailable for ${event.name}` : `No flyer for ${event.name}`} sx={{ minHeight: 150, display: "grid", placeItems: "center", bgcolor: "action.hover", borderRadius: 1.5, color: "text.secondary" }}>
        <Stack alignItems="center" gap={0.5}><ImageNotSupportedOutlinedIcon /><Typography variant="caption">{url ? "Flyer unavailable" : "No flyer"}</Typography></Stack>
      </Box>
    );
  }
  return <Box component="img" src={url} alt={`Flyer for ${event.name}`} loading="lazy" onError={() => setBroken(true)} sx={{ width: "100%", height: 190, objectFit: "contain", bgcolor: "#05070c", borderRadius: 1.5 }} />;
}

export default function ExperimentalPage({ profile }: { profile: DashboardProfile }) {
  const [series, setSeries] = useState<SeriesDraft[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [people, setPeople] = useState<DashboardProfile[]>([]);
  const [ownerDrafts, setOwnerDrafts] = useState<OwnerDraft[]>([]);
  const [eventLinks, setEventLinks] = useState<EventLink[]>([]);
  const [assignments, setAssignments] = useState<AssignmentLink[]>([]);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkSeriesRow[]>(() => [emptyBulkRow()]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [pendingSeries, setPendingSeries] = useState<Record<string, string>>({});
  const [panelOpen, setPanelOpen] = useState(true);
  const [focusNext, setFocusNext] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [seriesResult, eventsResult, peopleResult, ownerDraftsResult, eventLinksResult, assignmentsResult] = await Promise.all([
      supabaseClient.from("experimental_series_drafts").select("*").order("updated_at", { ascending: false }),
      supabaseClient.from("dashboard_events_admin").select("*").order("name").limit(1000),
      supabaseClient.from("dashboard_profiles").select("*").order("display_name").limit(1000),
      supabaseClient.from("experimental_owner_drafts").select("id,display_name,linked_profile_id").order("display_name"),
      supabaseClient.from("experimental_series_event_links").select("series_id,event_id"),
      supabaseClient.from("event_assignments").select("*").eq("active", true),
    ]);
    const firstError = [seriesResult, eventsResult, peopleResult, ownerDraftsResult, eventLinksResult, assignmentsResult].find(result => result.error)?.error;
    if (firstError) setError(firstError.message);
    setSeries((seriesResult.data as SeriesDraft[] | null) ?? []);
    setEvents((eventsResult.data as DashboardEvent[] | null) ?? []);
    setPeople((peopleResult.data as DashboardProfile[] | null) ?? []);
    setOwnerDrafts((ownerDraftsResult.data as OwnerDraft[] | null) ?? []);
    setEventLinks((eventLinksResult.data as EventLink[] | null) ?? []);
    setAssignments((assignmentsResult.data as AssignmentLink[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linksByEvent = useMemo(() => {
    const result = new Map<string, EventLink[]>();
    eventLinks.forEach(link => result.set(link.event_id, [...(result.get(link.event_id) ?? []), link]));
    return result;
  }, [eventLinks]);
  const seriesById = useMemo(() => new Map(series.map(item => [item.id, item])), [series]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const styles = useMemo(() => [...new Set(events.map(item => item.style).filter(Boolean))].sort(), [events]);
  const states = useMemo(() => [...new Set(events.map(item => item.state).filter((value): value is string => Boolean(value)))].sort(), [events]);

  function relationshipState(eventId: string): RelationshipState {
    const links = linksByEvent.get(eventId) ?? [];
    if (!links.length) return "unlinked";
    if (links.length !== 1) return "needs_review";
    return ownerValue(seriesById.get(links[0].series_id)) ? "complete" : "unassigned";
  }

  const matchingEvents = useMemo(() => events.filter(item => {
    const matchesSearch = !normalizedSearch || [item.name, item.event_key, item.style, item.venue, item.state, item.day_of_week, item.monthly_rule]
      .some(value => String(value ?? "").toLowerCase().includes(normalizedSearch));
    const state = relationshipState(item.id);
    const matchesLink = linkFilter === "all" || (linkFilter === "needs_review" ? state !== "complete" : state === linkFilter);
    return matchesSearch && matchesLink && (!styleFilter || item.style === styleFilter) && (!stateFilter || item.state === stateFilter);
  }), [events, normalizedSearch, styleFilter, stateFilter, linkFilter, linksByEvent, seriesById]);

  const counts = useMemo(() => events.reduce((result, item) => {
    const state = relationshipState(item.id);
    result[state] += 1;
    if (state !== "complete") result.needs_review += 1;
    return result;
  }, { unlinked: 0, unassigned: 0, complete: 0, needs_review: 0 }), [events, linksByEvent, seriesById]);

  const pageCount = Math.max(1, Math.ceil(matchingEvents.length / PAGE_SIZE));
  const visibleEvents = matchingEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [searchQuery, styleFilter, stateFilter, linkFilter]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  async function createOwner(event: FormEvent) {
    event.preventDefault(); setError("");
    const displayName = newOwnerName.trim();
    if (!displayName) return;
    const { data, error: insertError } = await supabaseClient.from("experimental_owner_drafts")
      .insert({ display_name: displayName, created_by: profile.id })
      .select("id,display_name,linked_profile_id").single();
    if (insertError || !data) setError(insertError?.message ?? "The owner was not returned after saving.");
    else {
      const owner = data as OwnerDraft;
      setOwnerDrafts(items => [...items, owner].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setNewOwnerName("");
    }
  }

  async function createBulkSeries(event: FormEvent) {
    event.preventDefault(); setError("");
    const completed = bulkRows.filter(row => row.name.trim() || row.code.trim());
    if (!completed.length) return;
    if (completed.some(row => !row.name.trim() || !row.code.trim())) {
      setError("Every used row needs both a series name and a memorable code."); return;
    }
    const payload = completed.map(row => ({
      series_code: row.code.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, ""),
      name: row.name.trim(), series_type: row.seriesType,
      primary_owner_profile_id: row.ownerId.startsWith("profile:") ? row.ownerId.slice(8) : null,
      primary_owner_draft_id: row.ownerId.startsWith("draft:") ? row.ownerId.slice(6) : null,
      created_by: profile.id,
    }));
    setBulkSaving(true);
    const { data, error: insertError } = await supabaseClient.from("experimental_series_drafts").insert(payload).select("*");
    setBulkSaving(false);
    if (insertError || !data) setError(insertError?.message ?? "The new series were not returned after saving.");
    else {
      setSeries(items => [...(data as SeriesDraft[]), ...items]);
      setBulkRows([emptyBulkRow()]);
    }
  }

  function updateBulkRow(index: number, patch: Partial<BulkSeriesRow>) {
    setBulkRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }
  function updateBulkOwner(index: number, ownerId: string) {
    setBulkRows(rows => rows.map((row, rowIndex) => rowIndex >= index ? { ...row, ownerId } : row));
  }

  async function readBackRelationship(eventId: string, seriesId?: string) {
    const linksResult = await supabaseClient.from("experimental_series_event_links").select("series_id,event_id").eq("event_id", eventId);
    if (linksResult.error) throw linksResult.error;
    const verifiedLinks = (linksResult.data as EventLink[] | null) ?? [];
    setEventLinks(items => [...items.filter(item => item.event_id !== eventId), ...verifiedLinks]);
    if (seriesId) {
      const seriesResult = await supabaseClient.from("experimental_series_drafts")
        .select("*").eq("id", seriesId).maybeSingle();
      if (seriesResult.error || !seriesResult.data) throw seriesResult.error ?? new Error("Saved series could not be read back.");
      const verifiedSeries = seriesResult.data as SeriesDraft;
      setSeries(items => items.map(item => item.id === verifiedSeries.id ? verifiedSeries : item));
    }
    return verifiedLinks;
  }

  function moveToNextNeedsReview(eventId: string) {
    const currentIndex = matchingEvents.findIndex(item => item.id === eventId);
    const next = matchingEvents.slice(currentIndex + 1).find(item => relationshipState(item.id) !== "complete")
      ?? matchingEvents.find(item => item.id !== eventId && relationshipState(item.id) !== "complete");
    if (!next) return;
    const nextIndex = matchingEvents.findIndex(item => item.id === next.id);
    setPage(Math.floor(nextIndex / PAGE_SIZE) + 1);
    window.setTimeout(() => document.getElementById(`series-select-${next.id}`)?.focus(), 80);
  }

  async function saveRelationship(event: DashboardEvent, nextSeriesId: string, nextOwnerValue: string, writeOwner = false) {
    const priorLinks = linksByEvent.get(event.id) ?? [];
    setPendingSeries(items => ({ ...items, [event.id]: nextSeriesId }));
    setSaveStates(items => ({ ...items, [event.id]: { state: "saving", message: "Saving…" } }));
    try {
      if (!nextSeriesId) {
        const { error: deleteError } = await supabaseClient.from("experimental_series_event_links").delete().eq("event_id", event.id);
        if (deleteError) throw deleteError;
        const verifiedLinks = await readBackRelationship(event.id);
        if (verifiedLinks.length) throw new Error("The event still has a draft-series link after unlinking.");
        setSaveStates(items => ({ ...items, [event.id]: { state: "saved", message: "Saved — needs series" } }));
        return;
      }

      if (!priorLinks.some(link => link.series_id === nextSeriesId)) {
        const { error: insertError } = await supabaseClient.from("experimental_series_event_links").insert({
          series_id: nextSeriesId, event_id: event.id, created_by: profile.id,
        });
        if (insertError) throw insertError;
      }

      if (nextOwnerValue || writeOwner) {
        const ownerPatch = {
          primary_owner_profile_id: nextOwnerValue.startsWith("profile:") ? nextOwnerValue.slice(8) : null,
          primary_owner_draft_id: nextOwnerValue.startsWith("draft:") ? nextOwnerValue.slice(6) : null,
        };
        const { data, error: ownerError } = await supabaseClient.from("experimental_series_drafts")
          .update(ownerPatch).eq("id", nextSeriesId).select("*").maybeSingle();
        if (ownerError || !data || ownerValue(data as SeriesDraft) !== nextOwnerValue) throw ownerError ?? new Error("The owner change could not be confirmed.");
      }

      const oldSeriesIds = priorLinks.filter(link => link.series_id !== nextSeriesId).map(link => link.series_id);
      if (oldSeriesIds.length) {
        const { error: cleanupError } = await supabaseClient.from("experimental_series_event_links")
          .delete().eq("event_id", event.id).in("series_id", oldSeriesIds);
        if (cleanupError) throw cleanupError;
      }

      const verifiedLinks = await readBackRelationship(event.id, nextSeriesId);
      if (verifiedLinks.length !== 1 || verifiedLinks[0].series_id !== nextSeriesId) throw new Error("The saved relationship did not match after read-back.");
      const verifiedSeries = seriesById.get(nextSeriesId);
      const complete = Boolean(nextOwnerValue || ownerValue(verifiedSeries));
      setPendingSeries(items => { const next = { ...items }; delete next[event.id]; return next; });
      setSaveStates(items => ({ ...items, [event.id]: { state: "saved", message: complete ? "Saved" : "Saved — needs owner" } }));
      if (complete && focusNext) moveToNextNeedsReview(event.id);
    } catch (saveError) {
      try { await readBackRelationship(event.id, nextSeriesId || undefined); } catch { /* retain the last confirmed in-memory state */ }
      setPendingSeries(items => { const next = { ...items }; delete next[event.id]; return next; });
      const message = saveError instanceof Error
        ? saveError.message
        : typeof saveError === "object" && saveError !== null && "message" in saveError
          ? String(saveError.message)
          : "Save failed. The prior confirmed link was kept.";
      setSaveStates(items => ({ ...items, [event.id]: { state: "error", message } }));
    }
  }

  async function changeOwner(event: DashboardEvent, selectedSeriesId: string, nextOwnerValue: string) {
    if (!selectedSeriesId) return;
    await saveRelationship(event, selectedSeriesId, nextOwnerValue, true);
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><ScienceOutlinedIcon color="secondary" /><Typography variant="h4" component="h1">Experimental Dashboard</Typography><Chip label="Beta" color="secondary" size="small" /><ExperimentStatus status="live" /></Stack>
        <Typography color="text.secondary">Owner-only draft workspace. Relationship changes stay isolated from public listings and volunteer permissions.</Typography>
      </Box>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 360px" }, gap: 2.5, alignItems: "start" }}>
        <Stack spacing={2.5} minWidth={0}>
          <Paper sx={{ p: 2.5 }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
              <Box><Typography variant="h5" component="h2">Link existing events</Typography><Typography color="text.secondary">Choose a draft series on each event card. Changes save immediately and are verified before completion.</Typography></Box>
              <FormControlLabel control={<Switch checked={focusNext} onChange={event => setFocusNext(event.target.checked)} />} label="Focus next after linking" />
            </Stack>
            <TextField label="Search events" placeholder="Name, venue, location, style, or event key" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} fullWidth sx={{ mt: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5, mt: 1.5 }}>
              <FormControl fullWidth><InputLabel id="experimental-link-filter-label">Link status</InputLabel><Select labelId="experimental-link-filter-label" label="Link status" value={linkFilter} onChange={event => setLinkFilter(event.target.value as LinkFilter)}><MenuItem value="all">All events ({events.length})</MenuItem><MenuItem value="needs_review">Needs review ({counts.needs_review})</MenuItem><MenuItem value="unlinked">Unlinked ({counts.unlinked})</MenuItem><MenuItem value="unassigned">Owner unassigned ({counts.unassigned})</MenuItem><MenuItem value="complete">Completed ({counts.complete})</MenuItem></Select></FormControl>
              <FormControl fullWidth><InputLabel id="experimental-style-filter-label">Style</InputLabel><Select labelId="experimental-style-filter-label" label="Style" value={styleFilter} onChange={event => setStyleFilter(event.target.value)}><MenuItem value="">All styles</MenuItem>{styles.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
              <FormControl fullWidth><InputLabel id="experimental-state-filter-label">State</InputLabel><Select labelId="experimental-state-filter-label" label="State" value={stateFilter} onChange={event => setStateFilter(event.target.value)}><MenuItem value="">All locations</MenuItem>{states.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1} mt={1}>
              <Typography variant="caption" color="text.secondary">{`${matchingEvents.length} shown of ${events.length} events`}</Typography>
              <Button size="small" onClick={() => { setSearchQuery(""); setStyleFilter(""); setStateFilter(""); setLinkFilter("all"); }}>Clear filters</Button>
            </Stack>
          </Paper>

          {loading ? <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box> : !visibleEvents.length ? (
            <Paper sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">No events match these filters.</Typography></Paper>
          ) : (
            <Box className="event-grid">
              {visibleEvents.map(item => {
                const confirmedLinks = linksByEvent.get(item.id) ?? [];
                const confirmedSeriesId = confirmedLinks.length === 1 ? confirmedLinks[0].series_id : "";
                const selectedSeriesId = pendingSeries[item.id] ?? confirmedSeriesId;
                const selectedSeries = seriesById.get(selectedSeriesId);
                const selectedOwner = ownerValue(selectedSeries);
                const state = relationshipState(item.id);
                const feedback = saveStates[item.id];
                const saving = feedback?.state === "saving";
                return (
                  <Paper key={item.id} component="article" sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.5, border: "1px solid", borderColor: state === "complete" ? "success.dark" : state === "needs_review" ? "warning.dark" : "divider" }}>
                    <EventFlyer event={item} />
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                      <Box minWidth={0}><Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{item.event_key}</Typography></Box>
                      <Chip size="small" color={state === "complete" ? "success" : "warning"} label={state === "complete" ? "Linked" : "Needs review"} />
                    </Stack>
                    <Typography variant="body2">{formatDate(item)}</Typography>
                    <Typography color="text.secondary">{item.venue}{item.state ? ` · ${item.state}` : ""}</Typography>
                    <FormControl fullWidth disabled={saving || !series.length}>
                      <InputLabel id={`series-label-${item.id}`}>Draft event series</InputLabel>
                      <Select id={`series-select-${item.id}`} labelId={`series-label-${item.id}`} label="Draft event series" value={selectedSeriesId} onChange={event => void saveRelationship(item, event.target.value, ownerValue(seriesById.get(event.target.value)))}>
                        <MenuItem value=""><em>No series — needs review</em></MenuItem>
                        {series.map(draft => <MenuItem key={draft.id} value={draft.id}>{draft.series_code} — {draft.name}</MenuItem>)}
                      </Select>
                      {confirmedLinks.length > 1 && <FormHelperText error>Multiple links found. Choose the one to keep.</FormHelperText>}
                    </FormControl>
                    <FormControl fullWidth disabled={saving || !selectedSeriesId}>
                      <InputLabel id={`owner-label-${item.id}`}>Owner</InputLabel>
                      <Select labelId={`owner-label-${item.id}`} label="Owner" value={selectedOwner} onChange={event => void changeOwner(item, selectedSeriesId, event.target.value)}>
                        <MenuItem value=""><em>Unassigned</em></MenuItem>
                        {ownerDrafts.map(owner => <MenuItem key={`draft:${owner.id}`} value={`draft:${owner.id}`}>{owner.display_name}</MenuItem>)}
                        {people.map(person => <MenuItem key={`profile:${person.id}`} value={`profile:${person.id}`}>{person.display_name || person.email}</MenuItem>)}
                      </Select>
                      <FormHelperText>{selectedSeriesId ? "Primary owner for this draft series" : "Choose a draft series first"}</FormHelperText>
                    </FormControl>
                    <Box role="status" aria-live="polite" sx={{ minHeight: 22 }}>
                      {feedback && <Typography variant="caption" color={feedback.state === "error" ? "error" : feedback.state === "saved" ? "success.main" : "text.secondary"}>{feedback.message}</Typography>}
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
          {!loading && pageCount > 1 && <Stack direction="row" justifyContent="center"><Pagination page={page} count={pageCount} onChange={(_event, value) => setPage(value)} color="secondary" showFirstButton showLastButton aria-label="Relationship event pages" /></Stack>}
        </Stack>

        <Paper component="aside" aria-label="Manage owners and draft series" sx={{ position: { lg: "sticky" }, top: { lg: 88 }, maxHeight: { lg: "calc(100vh - 112px)" }, overflowY: { lg: "auto" }, p: 2, order: { xs: -1, lg: 0 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Stack direction="row" gap={1} alignItems="center"><TuneOutlinedIcon color="secondary" /><Typography variant="h6">Owners & series</Typography></Stack>
            <Button size="small" aria-expanded={panelOpen} onClick={() => setPanelOpen(value => !value)}>{panelOpen ? "Collapse" : "Expand"}</Button>
          </Stack>
          <Collapse in={panelOpen}>
            <Stack spacing={2.5} mt={2}>
              <Box component="form" onSubmit={createOwner}>
                <Typography fontWeight={800}>Add owner</Typography>
                <Typography variant="caption" color="text.secondary">Available to every card immediately after saving.</Typography>
                <Stack gap={1} mt={1}><TextField size="small" label="Owner name" value={newOwnerName} onChange={event => setNewOwnerName(event.target.value)} fullWidth /><Button type="submit" variant="outlined" disabled={!newOwnerName.trim()}>Add owner</Button></Stack>
                <Stack direction="row" gap={0.75} flexWrap="wrap" mt={1}>{ownerDrafts.map(owner => <Chip size="small" key={owner.id} label={owner.display_name} />)}</Stack>
              </Box>
              <Box component="form" onSubmit={createBulkSeries}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={800}>Draft series</Typography><Typography variant="caption" color="text.secondary">Bulk entry with owner carry-down.</Typography></Box><Button size="small" onClick={() => setBulkRows(rows => [...rows, emptyBulkRow()])}>Add row</Button></Stack>
                <Box sx={{ overflowX: "auto", mt: 1 }}>
                  <Table size="small" aria-label="Create draft event series">
                    <TableHead><TableRow><TableCell>Name & code</TableCell><TableCell>Owner</TableCell><TableCell /></TableRow></TableHead>
                    <TableBody>{bulkRows.map((row, index) => <TableRow key={index}>
                      <TableCell sx={{ minWidth: 185 }}><Stack gap={1}><TextField value={row.name} onChange={event => updateBulkRow(index, { name: event.target.value })} placeholder="Series name" size="small" /><TextField value={row.code} onChange={event => updateBulkRow(index, { code: event.target.value })} placeholder="JIVE-1042" size="small" /><Select value={row.seriesType} onChange={event => updateBulkRow(index, { seriesType: event.target.value as BulkSeriesRow["seriesType"] })} size="small"><MenuItem value="recurring">Recurring</MenuItem><MenuItem value="occasional">Occasional</MenuItem><MenuItem value="one_off">One-off</MenuItem></Select></Stack></TableCell>
                      <TableCell sx={{ minWidth: 170 }}><Select value={row.ownerId} onChange={event => updateBulkOwner(index, event.target.value)} displayEmpty size="small" fullWidth><MenuItem value="">Unassigned</MenuItem>{ownerDrafts.map(owner => <MenuItem key={`bulk-draft:${owner.id}`} value={`draft:${owner.id}`}>{owner.display_name}</MenuItem>)}{people.map(person => <MenuItem key={`bulk-profile:${person.id}`} value={`profile:${person.id}`}>{person.display_name || person.email}</MenuItem>)}</Select></TableCell>
                      <TableCell><Button color="inherit" size="small" onClick={() => setBulkRows(rows => rows.length === 1 ? [emptyBulkRow()] : rows.filter((_item, rowIndex) => rowIndex !== index))}>Remove</Button></TableCell>
                    </TableRow>)}</TableBody>
                  </Table>
                </Box>
                <Stack direction="row" justifyContent="flex-end" gap={1} mt={1}><Button size="small" onClick={() => setBulkRows([emptyBulkRow()])}>Clear</Button><Button type="submit" size="small" variant="contained" disabled={bulkSaving || !bulkRows.some(row => row.name.trim() || row.code.trim())}>{bulkSaving ? "Saving…" : bulkRows.length === 1 ? "Create draft" : "Save all"}</Button></Stack>
                <Stack gap={0.75} mt={1.5}>{series.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 1 }}><Typography variant="body2" fontWeight={750}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.series_code} · {ownerValue(item) ? "Owner assigned" : "Owner unassigned"}</Typography></Paper>)}</Stack>
              </Box>
            </Stack>
          </Collapse>
        </Paper>
      </Box>

      <DataQualityInbox events={events} profile={profile} />
      <DraftReviewExperiment events={events} profile={profile} />
      <VolunteerPreviewExperiment events={events} people={people} assignments={assignments} />
    </Stack>
  );
}
