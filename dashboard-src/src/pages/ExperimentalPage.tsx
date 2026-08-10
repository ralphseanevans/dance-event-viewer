import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, FormControl, FormControlLabel,
  FormHelperText, InputLabel, MenuItem, Pagination, Paper, Select, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import EventFilterBar, { PUBLIC_STYLE_ORDER, publicStyleCategory, type LocalArea, type RelationshipFilter } from "../components/EventFilterBar";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import DataQualityInbox from "./DataQualityInbox";
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
interface PublicFlyerMap { logos: Record<string, string>; patterns: Array<{ contains: string; logo: string }>; baseUrl: string; }
type SaveState = { state: "saving" | "saved" | "error"; message: string };
type RelationshipState = "unlinked" | "needs_review" | "linked";

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

function publicFlyerUrl(event: DashboardEvent, map: PublicFlyerMap): string {
  const exact = map.logos[event.event_key];
  const mapped = exact || map.patterns.find(pattern => event.event_key.includes(pattern.contains))?.logo;
  if (mapped) {
    try { return new URL(mapped, map.baseUrl).href; } catch { /* fall through to the database value */ }
  }
  return resolveFlyerUrl(event.flyer_url);
}

function EventFlyer({ event, url }: { event: DashboardEvent; url: string }) {
  const [broken, setBroken] = useState(false);
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
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState("");
  const [linkFilter, setLinkFilter] = useState<RelationshipFilter>("all");
  const [areaFilters, setAreaFilters] = useState<Set<LocalArea>>(() => new Set(["Pensacola area", "Mobile area"]));
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [publicFlyers, setPublicFlyers] = useState<PublicFlyerMap>({ logos: {}, patterns: [], baseUrl: "" });
  const [pendingSeries, setPendingSeries] = useState<Record<string, string>>({});
  const [confirmedSeriesByEvent, setConfirmedSeriesByEvent] = useState<Record<string, string>>({});
  // A recommendation is the review baseline loaded with a card, not the latest
  // selection. Keeping it separately prevents the badge from following focus.
  const [recommendedSeriesByEvent, setRecommendedSeriesByEvent] = useState<Record<string, string>>({});
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
    const loadedLinks = (eventLinksResult.data as EventLink[] | null) ?? [];
    setEventLinks(loadedLinks);
    setRecommendedSeriesByEvent(() => {
      const byEvent = new Map<string, EventLink[]>();
      loadedLinks.forEach(link => byEvent.set(link.event_id, [...(byEvent.get(link.event_id) ?? []), link]));
      return Object.fromEntries([...byEvent].flatMap(([eventId, links]) => links.length === 1 ? [[eventId, links[0].series_id]] : []));
    });
    setAssignments((assignmentsResult.data as AssignmentLink[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    const mapUrl = new URL("../logo-map.json", window.location.href);
    void fetch(`${mapUrl.href}?t=${Date.now()}`, { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(value => {
        if (!active || !value) return;
        const logos = value.logos && typeof value.logos === "object" && !Array.isArray(value.logos) ? value.logos as Record<string, string> : {};
        const patterns = Array.isArray(value.patterns)
          ? value.patterns.filter((item: unknown): item is { contains: string; logo: string } => Boolean(item && typeof item === "object" && "contains" in item && "logo" in item && typeof item.contains === "string" && item.contains && typeof item.logo === "string" && item.logo))
          : [];
        setPublicFlyers({ logos, patterns, baseUrl: mapUrl.href });
      })
      .catch(() => { /* Public flyer decoration is optional; database flyer_url remains the fallback. */ });
    return () => { active = false; };
  }, []);

  const linksByEvent = useMemo(() => {
    const result = new Map<string, EventLink[]>();
    eventLinks.forEach(link => result.set(link.event_id, [...(result.get(link.event_id) ?? []), link]));
    return result;
  }, [eventLinks]);
  const seriesById = useMemo(() => new Map(series.map(item => [item.id, item])), [series]);
  const ownerNameForSeries = useCallback((draft: SeriesDraft): string | undefined => draft.primary_owner_draft_id
    ? ownerDrafts.find(owner => owner.id === draft.primary_owner_draft_id)?.display_name
    : draft.primary_owner_profile_id
      ? people.find(person => person.id === draft.primary_owner_profile_id)?.display_name
        ?? people.find(person => person.id === draft.primary_owner_profile_id)?.email
      : undefined, [ownerDrafts, people]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const styles = useMemo(() => {
    const present = new Set(events.map(item => publicStyleCategory(item.style)));
    return PUBLIC_STYLE_ORDER.filter(category => present.has(category));
  }, [events]);
  const states = useMemo(() => [...new Set(events.map(item => item.state).filter((value): value is string => Boolean(value)))].sort(), [events]);
  const availableDaysOfWeek = useMemo(() => [...new Set(events.map(item => item.day_of_week).filter((value): value is string => Boolean(value)))].sort(), [events]);

  function relationshipState(eventId: string): RelationshipState {
    const links = linksByEvent.get(eventId) ?? [];
    if (!links.length) return "unlinked";
    if (links.length !== 1) return "needs_review";
    return confirmedSeriesByEvent[eventId] === links[0].series_id ? "linked" : "needs_review";
  }

  function eventArea(event: DashboardEvent): LocalArea | "" {
    const location = `${event.name} ${event.venue}`;
    if (/pensacola/i.test(location)) return "Pensacola area";
    if (/mobile/i.test(location)) return "Mobile area";
    return "";
  }

  const matchingEvents = useMemo(() => events.filter(item => {
    const matchesSearch = !normalizedSearch || [item.name, item.event_key, item.style, item.venue, item.state, item.day_of_week, item.monthly_rule]
      .some(value => String(value ?? "").toLowerCase().includes(normalizedSearch));
    const state = relationshipState(item.id);
    const matchesLink = linkFilter === "all" || (linkFilter === "needs_review" ? state !== "linked" : state === linkFilter);
    const area = eventArea(item);
    const matchesArea = !areaFilters.size || Boolean(area && areaFilters.has(area));
    return matchesSearch && matchesLink && matchesArea && (!styleFilter || publicStyleCategory(item.style) === styleFilter) && (!stateFilter || item.state === stateFilter) && (!selectedDayOfWeek || item.day_of_week === selectedDayOfWeek);
  }), [events, normalizedSearch, styleFilter, stateFilter, selectedDayOfWeek, linkFilter, areaFilters, linksByEvent, confirmedSeriesByEvent]);

  const counts = useMemo(() => events.reduce((result, item) => {
    const state = relationshipState(item.id);
    result[state] += 1;
    if (state !== "linked") result.needs_review += 1;
    return result;
  }, { unlinked: 0, linked: 0, needs_review: 0 }), [events, linksByEvent, confirmedSeriesByEvent]);

  const pageCount = Math.max(1, Math.ceil(matchingEvents.length / PAGE_SIZE));
  const visibleEvents = matchingEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [searchQuery, styleFilter, stateFilter, selectedDayOfWeek, linkFilter, areaFilters]);
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
    const next = matchingEvents.slice(currentIndex + 1).find(item => relationshipState(item.id) !== "linked")
      ?? matchingEvents.find(item => item.id !== eventId && relationshipState(item.id) !== "linked");
    if (!next) return;
    const nextIndex = matchingEvents.findIndex(item => item.id === next.id);
    setPage(Math.floor(nextIndex / PAGE_SIZE) + 1);
    window.setTimeout(() => document.getElementById(`series-select-${next.id}`)?.focus(), 80);
  }

  async function saveRelationship(event: DashboardEvent, nextSeriesId: string) {
    const priorLinks = linksByEvent.get(event.id) ?? [];
    setPendingSeries(items => ({ ...items, [event.id]: nextSeriesId }));
    setSaveStates(items => ({ ...items, [event.id]: { state: "saving", message: "Saving…" } }));
    try {
      if (!nextSeriesId) {
        const { error: deleteError } = await supabaseClient.from("experimental_series_event_links").delete().eq("event_id", event.id);
        if (deleteError) throw deleteError;
        const verifiedLinks = await readBackRelationship(event.id);
        if (verifiedLinks.length) throw new Error("The event still has a draft-series link after unlinking.");
        setPendingSeries(items => { const next = { ...items }; delete next[event.id]; return next; });
        setConfirmedSeriesByEvent(items => { const next = { ...items }; delete next[event.id]; return next; });
        setSaveStates(items => ({ ...items, [event.id]: { state: "saved", message: "Saved — needs series" } }));
        return;
      }

      if (!priorLinks.some(link => link.series_id === nextSeriesId)) {
        const { error: insertError } = await supabaseClient.from("experimental_series_event_links").insert({
          series_id: nextSeriesId, event_id: event.id, created_by: profile.id,
        });
        if (insertError) throw insertError;
      }

      const oldSeriesIds = priorLinks.filter(link => link.series_id !== nextSeriesId).map(link => link.series_id);
      if (oldSeriesIds.length) {
        const { error: cleanupError } = await supabaseClient.from("experimental_series_event_links")
          .delete().eq("event_id", event.id).in("series_id", oldSeriesIds);
        if (cleanupError) throw cleanupError;
      }

      const verifiedLinks = await readBackRelationship(event.id, nextSeriesId);
      if (verifiedLinks.length !== 1 || verifiedLinks[0].series_id !== nextSeriesId) throw new Error("The saved relationship did not match after read-back.");
      setPendingSeries(items => { const next = { ...items }; delete next[event.id]; return next; });
      setConfirmedSeriesByEvent(items => ({ ...items, [event.id]: nextSeriesId }));
      setSaveStates(items => ({ ...items, [event.id]: { state: "saved", message: "Saved" } }));
      if (focusNext) moveToNextNeedsReview(event.id);
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

  return (
    <Stack spacing={2.5}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><ScienceOutlinedIcon color="secondary" /><Typography variant="h4" component="h1">Experimental Dashboard</Typography><Chip label="Beta" color="secondary" size="small" /></Stack>
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
            <EventFilterBar search={searchQuery} onSearchChange={setSearchQuery} styles={styles} style={styleFilter} onStyleChange={setStyleFilter} states={states} state={stateFilter} onStateChange={setStateFilter} availableDaysOfWeek={availableDaysOfWeek} selectedDayOfWeek={selectedDayOfWeek} onSelectedDayOfWeekChange={setSelectedDayOfWeek} areas={areaFilters} onAreasChange={setAreaFilters} relationship={linkFilter} onRelationshipChange={setLinkFilter} counts={{ all: events.length, ...counts }} shown={matchingEvents.length} onReset={() => { setSearchQuery(""); setStyleFilter(""); setStateFilter(""); setSelectedDayOfWeek(""); setLinkFilter("all"); setAreaFilters(new Set(["Pensacola area", "Mobile area"])); }} />
          </Paper>

          {loading ? <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box> : !visibleEvents.length ? (
            <Paper sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">No events match these filters.</Typography></Paper>
          ) : (
            <Box className="event-grid">
              {visibleEvents.map(item => {
                const confirmedLinks = linksByEvent.get(item.id) ?? [];
                const confirmedSeriesId = confirmedLinks.length === 1 ? confirmedLinks[0].series_id : "";
                const recommendedSeriesId = recommendedSeriesByEvent[item.id] ?? "";
                const recommendationConfirmed = Boolean(recommendedSeriesId) && confirmedSeriesByEvent[item.id] === recommendedSeriesId;
                const selectedSeriesId = pendingSeries[item.id] ?? confirmedSeriesId;
                const selectedSeries = series.find(draft => draft.id === selectedSeriesId);
                const selectedOwner = selectedSeries ? ownerNameForSeries(selectedSeries) : undefined;
                const state = relationshipState(item.id);
                const feedback = saveStates[item.id];
                const saving = feedback?.state === "saving";
                return (
                  <Paper key={item.id} component="article" sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.5, border: "1px solid", borderColor: state === "linked" ? "success.dark" : state === "needs_review" ? "warning.dark" : "divider" }}>
                    <EventFlyer event={item} url={publicFlyerUrl(item, publicFlyers)} />
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                      <Box minWidth={0}><Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{item.event_key}</Typography></Box>
                      <Chip size="small" color={state === "linked" ? "success" : "warning"} label={state === "linked" ? "Linked" : "Needs review"} />
                    </Stack>
                    <Typography variant="body2">{formatDate(item)}</Typography>
                    <Typography color="text.secondary">{item.venue}{item.state ? ` · ${item.state}` : ""}</Typography>
                    <FormControl fullWidth disabled={saving || !series.length}>
                      <InputLabel id={`series-label-${item.id}`}>Draft event series</InputLabel>
                      <Select
                        id={`series-select-${item.id}`}
                        labelId={`series-label-${item.id}`}
                        label="Draft event series"
                        value={selectedSeriesId}
                        onChange={event => void saveRelationship(item, event.target.value)}
                        renderValue={() => selectedSeries ? (
                          <Stack direction="row" alignItems="center" gap={1} minWidth={0} width="100%">
                            <Typography component="span" noWrap>{selectedSeries.series_code} — {selectedSeries.name}</Typography>
                            <Typography component="span" variant="caption" color="text.secondary" noWrap sx={{ ml: "auto" }}>Owner: {selectedOwner ?? "Unassigned"}</Typography>
                            {recommendedSeriesId === selectedSeries.id && <Chip label="Recommended" size="small" color="success" variant="outlined" />}
                          </Stack>
                        ) : <em>No series — needs review</em>}
                        sx={{ minHeight: 44, "& .MuiSelect-select": { minHeight: "44px !important", boxSizing: "border-box", display: "flex", alignItems: "center" } }}
                      >
                        <MenuItem value=""><em>No series — needs review</em></MenuItem>
                        {series.map(draft => <MenuItem key={draft.id} value={draft.id}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} width="100%" minWidth={0}>
                            <Typography component="span" noWrap>{draft.series_code} — {draft.name}</Typography>
                            {recommendedSeriesId === draft.id && <Chip label="Recommended" size="small" color="success" variant="outlined" />}
                          </Stack>
                        </MenuItem>)}
                      </Select>
                      {confirmedLinks.length > 1 && <FormHelperText error>Multiple links found. Choose the one to keep.</FormHelperText>}
                    </FormControl>
                    <Box role="status" aria-live="polite" sx={{ minHeight: 22 }}>
                      {feedback ? <Typography variant="caption" color={feedback.state === "error" ? "error" : feedback.state === "saved" ? "success.main" : "text.secondary"}>{feedback.message}</Typography> : recommendedSeriesId ? <Typography variant="caption" color="text.secondary">Suggested — confirm below to save.</Typography> : null}
                    </Box>
                    {recommendedSeriesId && <FormControlLabel sx={{ mt: -1, alignSelf: "flex-start" }} control={<Checkbox checked={recommendationConfirmed} disabled={saving || recommendationConfirmed} onChange={event => { if (event.target.checked) void saveRelationship(item, recommendedSeriesId); }} inputProps={{ "aria-label": `Confirm recommended series for ${item.name}` }} />} label="Use recommended series" />}
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
                      <TableCell sx={{ minWidth: 170 }}><Select inputProps={{ "aria-label": `Owner for series row ${index + 1}` }} value={row.ownerId} onChange={event => updateBulkOwner(index, event.target.value)} displayEmpty size="small" fullWidth><MenuItem value="">Unassigned</MenuItem>{ownerDrafts.map(owner => <MenuItem key={`bulk-draft:${owner.id}`} value={`draft:${owner.id}`}>{owner.display_name}</MenuItem>)}{people.map(person => <MenuItem key={`bulk-profile:${person.id}`} value={`profile:${person.id}`}>{person.display_name || person.email}</MenuItem>)}</Select></TableCell>
                      <TableCell><Button color="inherit" size="small" onClick={() => setBulkRows(rows => rows.length === 1 ? [emptyBulkRow()] : rows.filter((_item, rowIndex) => rowIndex !== index))}>Remove</Button></TableCell>
                    </TableRow>)}</TableBody>
                  </Table>
                </Box>
                <Stack direction="row" justifyContent="flex-end" gap={1} mt={1}><Button size="small" onClick={() => setBulkRows([emptyBulkRow()])}>Clear</Button><Button type="submit" size="small" variant="contained" disabled={bulkSaving || !bulkRows.some(row => row.name.trim() || row.code.trim())}>{bulkSaving ? "Saving…" : bulkRows.length === 1 ? "Create draft" : "Save all"}</Button></Stack>
                <Stack gap={0.75} mt={1.5}>{series.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 1 }}><Typography variant="body2" fontWeight={750}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.series_code} · {ownerValue(item) ? `Owner: ${ownerNameForSeries(item) ?? "Unknown owner"}` : "Owner unassigned"}</Typography></Paper>)}</Stack>
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
