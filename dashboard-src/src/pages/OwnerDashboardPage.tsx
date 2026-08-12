import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Drawer, FormControl, FormControlLabel, FormHelperText, IconButton, InputLabel,
  Menu, MenuItem, Pagination, Paper, Radio, RadioGroup, Select, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import EventFilterBar, { PUBLIC_STYLE_ORDER, publicStyleCategory, type LocalArea, type RelationshipFilter } from "../components/EventFilterBar";
import type { DashboardEvent, DashboardProfile, EventAssignment } from "../types";
import { supabaseClient } from "../supabase";
import DataQualityInbox from "./DataQualityInbox";
import DraftReviewExperiment from "./DraftReviewExperiment";
import VolunteerPreviewExperiment from "./VolunteerPreviewExperiment";

interface SeriesDraft { id: string; series_code: string; name: string; series_type: "recurring" | "occasional" | "one_off"; primary_owner_profile_id: string | null; primary_owner_draft_id: string | null; notes: string; draft_status: "draft" | "ready" | "archived"; created_by: string; created_at: string; updated_at: string; }
interface OwnerDraft { id: string; display_name: string; linked_profile_id: string | null; }
interface EventLink { series_id: string; event_id: string; }
interface ManagerScope { id: string; manager_owner_draft_id: string | null; event_id: string | null; scope_type: string; }
interface ChangeDraft { id: string; event_id: string; proposed_changes: Partial<EventForm>; review_status: string; }
interface PublicFlyerMap { logos: Record<string, string>; patterns: Array<{ contains: string; logo: string }>; baseUrl: string; }
type SaveState = { state: "saving" | "saved" | "error"; message: string };
type DashboardView = "timeline" | "calendar" | "map";
type RelationshipState = "unlinked" | "needs_review" | "linked";
type EventForm = {
  name: string; style: string; event_type: DashboardEvent["event_type"]; day_of_week: string; monthly_rule: string;
  start_date: string; end_date: string; start_time: string; end_time: string; venue: string; state: string;
  notes: string; source_url: string; cost: string;
};

const PAGE_SIZE = 24;
const emptyForm = (): EventForm => ({ name: "", style: "West Coast Swing", event_type: "one_time", day_of_week: "", monthly_rule: "", start_date: "", end_date: "", start_time: "", end_time: "", venue: "", state: "", notes: "", source_url: "", cost: "" });
const nullable = (value: string) => value.trim() || null;
const messageOf = (value: unknown, fallback: string) => value instanceof Error ? value.message : typeof value === "object" && value !== null && "message" in value ? String(value.message) : fallback;

function formFromEvent(event: DashboardEvent): EventForm {
  return { name: event.name, style: event.style, event_type: event.event_type, day_of_week: event.day_of_week ?? "", monthly_rule: event.monthly_rule ?? "", start_date: event.start_date ?? "", end_date: event.end_date ?? "", start_time: event.start_time ?? "", end_time: event.end_time ?? "", venue: event.venue, state: event.state ?? "", notes: event.notes, source_url: event.source_url ?? "", cost: event.cost ?? "" };
}
function eventPayload(form: EventForm) {
  return { name: form.name.trim(), style: form.style.trim(), event_type: form.event_type, day_of_week: nullable(form.day_of_week), monthly_rule: nullable(form.monthly_rule), start_date: nullable(form.start_date), end_date: nullable(form.end_date), start_time: nullable(form.start_time), end_time: nullable(form.end_time), venue: form.venue.trim(), state: nullable(form.state), notes: form.notes, source_url: nullable(form.source_url), cost: nullable(form.cost) };
}
function formatDate(event: DashboardEvent): string { return event.start_date || event.day_of_week || event.monthly_rule || "Schedule pending"; }
function formatTime(event: DashboardEvent): string { return [event.start_time, event.end_time].filter(Boolean).join(" – "); }
function resolvedUrl(value: string | null | undefined): string { const url = value?.trim(); if (!url || typeof window === "undefined") return url ?? ""; if (/^(?:https?:|data:|blob:)/i.test(url)) return url; return new URL(url, new URL("../", window.location.href)).href; }
function flyerFor(event: DashboardEvent, map: PublicFlyerMap): string { if (event.flyer_url) return resolvedUrl(event.flyer_url); const mapped = map.logos[event.event_key] || map.patterns.find(item => event.event_key.includes(item.contains))?.logo; return mapped ? new URL(mapped, map.baseUrl).href : ""; }
function eventArea(event: DashboardEvent): LocalArea | "" { const value = `${event.name} ${event.venue}`; return /pensacola/i.test(value) ? "Pensacola area" : /mobile/i.test(value) ? "Mobile area" : ""; }

function EventFlyer({ event, url }: { event: DashboardEvent; url: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  if (!url || broken) return <Box role="img" aria-label={url ? `Flyer unavailable for ${event.name}` : `No flyer for ${event.name}`} sx={{ minHeight: 170, display: "grid", placeItems: "center", bgcolor: "action.hover", borderRadius: 2, color: "text.secondary" }}><Stack alignItems="center"><ImageNotSupportedOutlinedIcon /><Typography variant="caption">{url ? "Flyer unavailable" : "No flyer"}</Typography></Stack></Box>;
  return <Box component="img" src={url} alt={`Flyer for ${event.name}`} onError={() => setBroken(true)} sx={{ width: "100%", height: 210, objectFit: "contain", bgcolor: "#05070c", borderRadius: 2 }} />;
}

export default function OwnerDashboardPage({ profile }: { profile: DashboardProfile }) {
  const theme = useTheme();
  const desktopTools = useMediaQuery(theme.breakpoints.up("lg"));
  const mobileDialog = useMediaQuery(theme.breakpoints.down("sm"));
  const fileRef = useRef<HTMLInputElement>(null);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [series, setSeries] = useState<SeriesDraft[]>([]);
  const [owners, setOwners] = useState<OwnerDraft[]>([]);
  const [people, setPeople] = useState<DashboardProfile[]>([]);
  const [assignments, setAssignments] = useState<EventAssignment[]>([]);
  const [links, setLinks] = useState<EventLink[]>([]);
  const [managerScopes, setManagerScopes] = useState<ManagerScope[]>([]);
  const [changeDrafts, setChangeDrafts] = useState<ChangeDraft[]>([]);
  const [flyerMap, setFlyerMap] = useState<PublicFlyerMap>({ logos: {}, patterns: [], baseUrl: "" });
  const [recommended, setRecommended] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const [relationshipState, setRelationshipSave] = useState<Record<string, SaveState>>({});
  const [search, setSearch] = useState("");
  const [style, setStyle] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [day, setDay] = useState("");
  const [areas, setAreas] = useState<Set<LocalArea>>(() => new Set(["Pensacola area", "Mobile area"]));
  const [relationship, setRelationship] = useState<RelationshipFilter>("all");
  const [view, setView] = useState<DashboardView>("timeline");
  const [page, setPage] = useState(1);
  const [focusNext, setFocusNext] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuEvent, setMenuEvent] = useState<DashboardEvent | null>(null);
  const [flyerTarget, setFlyerTarget] = useState<DashboardEvent | null>(null);
  const [editorEvent, setEditorEvent] = useState<DashboardEvent | null>(null);
  const [editorForm, setEditorForm] = useState<EventForm>(emptyForm());
  const [editorSave, setEditorSave] = useState<SaveState | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [seriesForm, setSeriesForm] = useState({ id: "", name: "", code: "", type: "recurring" as SeriesDraft["series_type"], ownerId: "" });
  const [ownerForm, setOwnerForm] = useState({ id: "", name: "" });
  const [seriesDelete, setSeriesDelete] = useState<SeriesDraft | null>(null);
  const [seriesImpact, setSeriesImpact] = useState<"series_only" | "series_and_events">("series_only");
  const [seriesPhrase, setSeriesPhrase] = useState("");
  const [seriesDeleting, setSeriesDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const results = await Promise.all([
      supabaseClient.from("dashboard_events_admin").select("*").order("updated_at", { ascending: false }).limit(1000),
      supabaseClient.from("experimental_series_drafts").select("*").neq("draft_status", "archived").order("name"),
      supabaseClient.from("experimental_owner_drafts").select("id,display_name,linked_profile_id").order("display_name"),
      supabaseClient.from("experimental_series_event_links").select("series_id,event_id"),
      supabaseClient.from("experimental_manager_scope_drafts").select("id,manager_owner_draft_id,event_id,scope_type").eq("scope_type", "event"),
      supabaseClient.from("experimental_event_change_drafts").select("id,event_id,proposed_changes,review_status").eq("review_status", "draft"),
      supabaseClient.from("dashboard_profiles").select("*").order("display_name"),
      supabaseClient.from("event_assignments").select("*").eq("active", true),
    ]);
    const firstError = results.find(item => item.error)?.error;
    if (firstError) setError(firstError.message);
    setEvents((results[0].data as DashboardEvent[] | null) ?? []);
    setSeries((results[1].data as SeriesDraft[] | null) ?? []);
    setOwners((results[2].data as OwnerDraft[] | null) ?? []);
    const loadedLinks = (results[3].data as EventLink[] | null) ?? [];
    setLinks(loadedLinks);
    setRecommended(Object.fromEntries(eventsWithOneLink(loadedLinks).map(([eventId, seriesId]) => [eventId, seriesId])));
    setManagerScopes((results[4].data as ManagerScope[] | null) ?? []);
    setChangeDrafts((results[5].data as ChangeDraft[] | null) ?? []);
    setPeople((results[6].data as DashboardProfile[] | null) ?? []);
    setAssignments((results[7].data as EventAssignment[] | null) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const mapUrl = new URL("../logo-map.json", window.location.href);
    void fetch(`${mapUrl.href}?t=${Date.now()}`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(value => {
      if (!value) return;
      setFlyerMap({ logos: value.logos ?? {}, patterns: Array.isArray(value.patterns) ? value.patterns : [], baseUrl: mapUrl.href });
    }).catch(() => undefined);
  }, []);

  const linksByEvent = useMemo(() => { const result = new Map<string, EventLink[]>(); links.forEach(link => result.set(link.event_id, [...(result.get(link.event_id) ?? []), link])); return result; }, [links]);
  const seriesById = useMemo(() => new Map(series.map(item => [item.id, item])), [series]);
  const ownerById = useMemo(() => new Map(owners.map(item => [item.id, item])), [owners]);
  const styles = useMemo(() => { const present = new Set(events.map(item => publicStyleCategory(item.style))); return PUBLIC_STYLE_ORDER.filter(item => present.has(item)); }, [events]);
  const states = useMemo(() => [...new Set(events.map(item => item.state).filter((item): item is string => Boolean(item)))].sort(), [events]);
  const days = useMemo(() => [...new Set(events.map(item => item.day_of_week).filter((item): item is string => Boolean(item)))].sort(), [events]);
  function linkState(eventId: string): RelationshipState { const found = linksByEvent.get(eventId) ?? []; if (!found.length) return "unlinked"; if (found.length !== 1) return "needs_review"; return confirmed[eventId] === found[0].series_id ? "linked" : "needs_review"; }
  const counts = useMemo(() => events.reduce((result, item) => { const current = linkState(item.id); result[current] += 1; if (current !== "linked") result.needs_review += 1; return result; }, { unlinked: 0, linked: 0, needs_review: 0 }), [events, linksByEvent, confirmed]);
  const filtered = useMemo(() => events.filter(item => {
    const needle = search.trim().toLowerCase(); const current = linkState(item.id); const area = eventArea(item);
    return (!needle || [item.name, item.event_key, item.venue, item.style, item.state].some(value => String(value ?? "").toLowerCase().includes(needle)))
      && (relationship === "all" || (relationship === "needs_review" ? current !== "linked" : current === relationship))
      && (!areas.size || Boolean(area && areas.has(area))) && (!style || publicStyleCategory(item.style) === style)
      && (!stateFilter || item.state === stateFilter) && (!day || item.day_of_week === day);
  }).sort((a, b) => view === "calendar" ? String(a.start_date ?? "9999").localeCompare(String(b.start_date ?? "9999")) : view === "map" ? a.venue.localeCompare(b.venue) : a.name.localeCompare(b.name)), [events, search, relationship, areas, style, stateFilter, day, linksByEvent, confirmed, view]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, relationship, areas, style, stateFilter, day, view]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  function ownerName(event: DashboardEvent, selectedSeries?: SeriesDraft) { const direct = managerScopes.find(scope => scope.event_id === event.id)?.manager_owner_draft_id; return (direct ? ownerById.get(direct)?.display_name : undefined) ?? (selectedSeries?.primary_owner_draft_id ? ownerById.get(selectedSeries.primary_owner_draft_id)?.display_name : undefined) ?? "Unassigned"; }
  async function readLinks(eventId: string) { const result = await supabaseClient.from("experimental_series_event_links").select("series_id,event_id").eq("event_id", eventId); if (result.error) throw result.error; const verified = (result.data as EventLink[] | null) ?? []; setLinks(items => [...items.filter(item => item.event_id !== eventId), ...verified]); return verified; }
  async function saveSeriesLink(event: DashboardEvent, seriesId: string) {
    setRelationshipSave(items => ({ ...items, [event.id]: { state: "saving", message: "Saving…" } }));
    try {
      const prior = linksByEvent.get(event.id) ?? [];
      if (seriesId && !prior.some(item => item.series_id === seriesId)) { const inserted = await supabaseClient.from("experimental_series_event_links").insert({ series_id: seriesId, event_id: event.id, created_by: profile.id }); if (inserted.error) throw inserted.error; }
      const old = prior.filter(item => item.series_id !== seriesId).map(item => item.series_id);
      if (old.length) { const removed = await supabaseClient.from("experimental_series_event_links").delete().eq("event_id", event.id).in("series_id", old); if (removed.error) throw removed.error; }
      if (!seriesId) { const removed = await supabaseClient.from("experimental_series_event_links").delete().eq("event_id", event.id); if (removed.error) throw removed.error; }
      const verified = await readLinks(event.id); if ((seriesId && (verified.length !== 1 || verified[0].series_id !== seriesId)) || (!seriesId && verified.length)) throw new Error("The Event Series did not match after read-back.");
      setConfirmed(items => seriesId ? { ...items, [event.id]: seriesId } : Object.fromEntries(Object.entries(items).filter(([key]) => key !== event.id)));
      setRecommended(items => Object.fromEntries(Object.entries(items).filter(([key]) => key !== event.id)));
      setRelationshipSave(items => ({ ...items, [event.id]: { state: "saved", message: seriesId ? "Linked / Saved" : "Saved — unlinked" } }));
      if (focusNext) window.setTimeout(() => document.querySelector<HTMLElement>(`[data-series-event='${event.id}']`)?.focus(), 50);
    } catch (value) { setRelationshipSave(items => ({ ...items, [event.id]: { state: "error", message: messageOf(value, "Save failed; the prior relationship was preserved.") } })); await readLinks(event.id).catch(() => undefined); }
  }

  function openMenu(event: DashboardEvent, anchor: HTMLElement) { setMenuEvent(event); setMenuAnchor(anchor); }
  function closeMenu() { setMenuAnchor(null); }
  async function openEditor(event: DashboardEvent) {
    closeMenu(); setEditorEvent(event); setEditorSave(null); setPreview(false); setEditorReady(false);
    const draft = changeDrafts.find(item => item.event_id === event.id);
    setEditorForm({ ...formFromEvent(event), ...(draft?.proposed_changes ?? {}) });
    window.setTimeout(() => setEditorReady(true), 100);
  }
  async function createEvent() {
    setError(""); const today = new Date().toISOString().slice(0, 10); const key = `draft-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const result = await supabaseClient.from("dashboard_events_admin").insert({ ...eventPayload(emptyForm()), event_key: key, record_status: "draft", in_wcs_list: false, source_type: "dashboard", source_detail: "owner dashboard draft", source_skill: null, first_seen: today, last_confirmed: today, added_to_calendar: false, calendar_event_id: null, research_batch: null, research_confidence: "high", exclude_dates: null, exclude_monthly_rules: null }).select("*").single();
    if (result.error || !result.data) { setError(result.error?.message ?? "The new draft was not returned."); return; }
    const created = result.data as DashboardEvent; setEvents(items => [created, ...items]); await openEditor(created);
  }
  useEffect(() => {
    if (!editorEvent || !editorReady) return;
    const timer = window.setTimeout(() => void autosaveEditor(editorEvent, editorForm), 650);
    return () => window.clearTimeout(timer);
  }, [editorForm, editorEvent?.id, editorReady]);
  async function autosaveEditor(event: DashboardEvent, form: EventForm) {
    setEditorSave({ state: "saving", message: "Saving…" });
    try {
      if (event.record_status === "draft") {
        const result = await supabaseClient.from("dashboard_events_admin").update(eventPayload(form)).eq("id", event.id).select("*").single();
        if (result.error || !result.data) throw result.error ?? new Error("Draft read-back failed.");
        const saved = result.data as DashboardEvent; setEditorEvent(saved); setEvents(items => items.map(item => item.id === saved.id ? saved : item));
      } else {
        const existing = changeDrafts.find(item => item.event_id === event.id);
        const query = existing ? supabaseClient.from("experimental_event_change_drafts").update({ proposed_changes: eventPayload(form), review_status: "draft" }).eq("id", existing.id) : supabaseClient.from("experimental_event_change_drafts").insert({ event_id: event.id, proposed_changes: eventPayload(form), note: "Owner dashboard autosave", review_status: "draft", created_by: profile.id });
        const result = await query.select("id,event_id,proposed_changes,review_status").single();
        if (result.error || !result.data) throw result.error ?? new Error("Draft read-back failed.");
        const saved = result.data as ChangeDraft; setChangeDrafts(items => [...items.filter(item => item.event_id !== event.id), saved]);
      }
      setEditorSave({ state: "saved", message: "Saved" });
    } catch (value) { setEditorSave({ state: "error", message: messageOf(value, "Autosave failed. Your form remains open for retry.") }); }
  }
  function validation(form: EventForm) { const problems: string[] = []; if (!form.name.trim()) problems.push("Event name is required."); if (!form.start_date && !form.day_of_week && !form.monthly_rule) problems.push("Add a date or recurring schedule."); if (!form.venue.trim()) problems.push("Location is required."); if (!form.style.trim()) problems.push("Dance style is required."); return problems; }
  async function publishEvent() {
    if (!editorEvent) return; const problems = validation(editorForm); if (problems.length) { setEditorSave({ state: "error", message: problems.join(" ") }); return; }
    setPublishing(true); setEditorSave({ state: "saving", message: "Publishing…" });
    try {
      const result = await supabaseClient.from("dashboard_events_admin").update({ ...eventPayload(editorForm), record_status: "active" }).eq("id", editorEvent.id).select("*").single();
      if (result.error || !result.data) throw result.error ?? new Error("Published event read-back failed.");
      const saved = result.data as DashboardEvent;
      const publicResult = await supabaseClient.from("event_listings").select("key,name,venue").eq("key", saved.event_key).single();
      if (publicResult.error || publicResult.data?.name !== saved.name || publicResult.data?.venue !== saved.venue) throw publicResult.error ?? new Error("The public listing did not match after publish.");
      const draft = changeDrafts.find(item => item.event_id === saved.id); if (draft) { const removed = await supabaseClient.from("experimental_event_change_drafts").delete().eq("id", draft.id); if (removed.error) throw removed.error; setChangeDrafts(items => items.filter(item => item.id !== draft.id)); }
      setEvents(items => items.map(item => item.id === saved.id ? saved : item)); setEditorEvent(saved); setEditorSave({ state: "saved", message: "Published and verified" }); setNotice(`Published and verified: ${saved.name}`);
    } catch (value) { setEditorSave({ state: "error", message: messageOf(value, "Publish failed; the draft remains available.") }); }
    setPublishing(false);
  }
  async function cancelEvent(event: DashboardEvent) {
    closeMenu(); if (!window.confirm(`Cancel “${event.name}”? Only this occurrence is affected; its Event Series and other events stay unchanged.`)) return;
    const result = await supabaseClient.from("dashboard_events_admin").update({ record_status: "cancelled" }).eq("id", event.id).select("*").single();
    if (result.error || !result.data) { setError(result.error?.message ?? "Cancellation read-back failed."); return; }
    const publicResult = await supabaseClient.from("event_listings").select("key").eq("key", event.event_key).maybeSingle();
    if (publicResult.error || publicResult.data) { setError(publicResult.error?.message ?? "The cancelled event is still public."); return; }
    setEvents(items => items.map(item => item.id === event.id ? result.data as DashboardEvent : item)); setNotice(`Cancelled and verified: ${event.name}`);
  }

  function chooseFlyer(event: DashboardEvent) { closeMenu(); setFlyerTarget(event); window.setTimeout(() => fileRef.current?.click(), 0); }
  async function uploadFlyer(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0]; const target = flyerTarget; change.target.value = ""; if (!file || !target) return;
    setNotice("Saving flyer…"); const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"); const objectName = `${target.id}/${Date.now()}-${safe}`;
    try {
      const uploaded = await supabaseClient.storage.from("event-flyers").upload(objectName, file, { cacheControl: "3600", upsert: false }); if (uploaded.error) throw uploaded.error;
      const publicUrl = supabaseClient.storage.from("event-flyers").getPublicUrl(objectName).data.publicUrl;
      const updated = await supabaseClient.from("dashboard_events_admin").update({ flyer_url: publicUrl }).eq("id", target.id).select("*").single(); if (updated.error || !updated.data) throw updated.error ?? new Error("Flyer event read-back failed.");
      const verified = await supabaseClient.storage.from("event-flyers").list(target.id, { search: objectName.split("/")[1] }); if (verified.error || !verified.data?.some(item => `${target.id}/${item.name}` === objectName)) throw verified.error ?? new Error("Uploaded flyer was not found on read-back.");
      if (target.flyer_url?.includes("/storage/v1/object/public/event-flyers/")) { const oldName = decodeURIComponent(target.flyer_url.split("/event-flyers/")[1] ?? ""); if (oldName) await supabaseClient.storage.from("event-flyers").remove([oldName]); }
      setEvents(items => items.map(item => item.id === target.id ? updated.data as DashboardEvent : item)); setNotice(`Flyer saved and verified for ${target.name}`);
    } catch (value) { setError(messageOf(value, "Flyer upload failed; the event was preserved.")); }
    setFlyerTarget(null);
  }
  async function removeFlyer(event: DashboardEvent) {
    closeMenu(); const old = event.flyer_url; const updated = await supabaseClient.from("dashboard_events_admin").update({ flyer_url: null }).eq("id", event.id).select("*").single();
    if (updated.error || !updated.data || updated.data.flyer_url !== null) { setError(updated.error?.message ?? "Flyer removal read-back failed."); return; }
    if (old?.includes("/storage/v1/object/public/event-flyers/")) { const objectName = decodeURIComponent(old.split("/event-flyers/")[1] ?? ""); if (objectName) { const removed = await supabaseClient.storage.from("event-flyers").remove([objectName]); if (removed.error) { setError(`The event no longer references the flyer, but storage cleanup failed: ${removed.error.message}`); return; } } }
    setEvents(items => items.map(item => item.id === event.id ? updated.data as DashboardEvent : item)); setNotice(`Flyer removed and verified for ${event.name}`);
  }

  async function saveEventOwner(event: DashboardEvent, ownerId: string) {
    const prior = managerScopes.filter(scope => scope.event_id === event.id);
    setEditorSave({ state: "saving", message: "Saving owner/coach…" });
    try {
      if (ownerId && !prior.some(scope => scope.manager_owner_draft_id === ownerId)) {
        const inserted = await supabaseClient.from("experimental_manager_scope_drafts").insert({ manager_owner_draft_id: ownerId, manager_profile_id: null, scope_type: "event", event_id: event.id, owner_draft_id: null, series_id: null, created_by: profile.id });
        if (inserted.error) throw inserted.error;
      }
      const oldIds = prior.filter(scope => scope.manager_owner_draft_id !== ownerId).map(scope => scope.id);
      if (oldIds.length) { const removed = await supabaseClient.from("experimental_manager_scope_drafts").delete().in("id", oldIds); if (removed.error) throw removed.error; }
      if (!ownerId && prior.length) { const removed = await supabaseClient.from("experimental_manager_scope_drafts").delete().eq("event_id", event.id).eq("scope_type", "event"); if (removed.error) throw removed.error; }
      const readBack = await supabaseClient.from("experimental_manager_scope_drafts").select("id,manager_owner_draft_id,event_id,scope_type").eq("event_id", event.id).eq("scope_type", "event");
      if (readBack.error) throw readBack.error; const verified = (readBack.data as ManagerScope[] | null) ?? [];
      if ((ownerId && (verified.length !== 1 || verified[0].manager_owner_draft_id !== ownerId)) || (!ownerId && verified.length)) throw new Error("Owner/coach did not match after read-back.");
      setManagerScopes(items => [...items.filter(scope => scope.event_id !== event.id), ...verified]); setEditorSave({ state: "saved", message: "Owner/coach Saved" });
    } catch (value) { setEditorSave({ state: "error", message: messageOf(value, "Owner/coach save failed.") }); }
  }

  async function saveSeries(event: FormEvent) {
    event.preventDefault(); const payload = { name: seriesForm.name.trim(), series_code: seriesForm.code.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-"), series_type: seriesForm.type, primary_owner_draft_id: seriesForm.ownerId || null, primary_owner_profile_id: null, created_by: profile.id };
    if (!payload.name || !payload.series_code) return;
    const query = seriesForm.id ? supabaseClient.from("experimental_series_drafts").update(payload).eq("id", seriesForm.id) : supabaseClient.from("experimental_series_drafts").insert(payload);
    const result = await query.select("*").single(); if (result.error || !result.data) { setError(result.error?.message ?? "Event Series read-back failed."); return; }
    const saved = result.data as SeriesDraft; setSeries(items => [saved, ...items.filter(item => item.id !== saved.id)].sort((a, b) => a.name.localeCompare(b.name))); setSeriesForm({ id: "", name: "", code: "", type: "recurring", ownerId: "" }); setNotice(`Event Series saved: ${saved.name}`);
  }
  async function saveOwner(event: FormEvent) {
    event.preventDefault(); const name = ownerForm.name.trim(); if (!name) return;
    const query = ownerForm.id ? supabaseClient.from("experimental_owner_drafts").update({ display_name: name }).eq("id", ownerForm.id) : supabaseClient.from("experimental_owner_drafts").insert({ display_name: name, created_by: profile.id });
    const result = await query.select("id,display_name,linked_profile_id").single(); if (result.error || !result.data) { setError(result.error?.message ?? "Owner/coach read-back failed."); return; }
    const saved = result.data as OwnerDraft; setOwners(items => [saved, ...items.filter(item => item.id !== saved.id)].sort((a, b) => a.display_name.localeCompare(b.display_name))); setOwnerForm({ id: "", name: "" }); setNotice(`Owner/coach saved: ${saved.display_name}`);
  }
  const deleteConnections = useMemo(() => seriesDelete ? links.filter(item => item.series_id === seriesDelete.id).map(item => events.find(event => event.id === item.event_id)).filter((item): item is DashboardEvent => Boolean(item)) : [], [seriesDelete, links, events]);
  const deleteDates = deleteConnections.map(item => item.start_date).filter((item): item is string => Boolean(item)).sort();
  async function deleteSeries() {
    if (!seriesDelete || seriesPhrase !== "DELETE SERIES") return; setSeriesDeleting(true);
    const result = await supabaseClient.rpc("delete_event_series", { target_series_id: seriesDelete.id, delete_connected_events: seriesImpact === "series_and_events", confirmation: seriesPhrase });
    if (result.error) { setError(result.error.message); setSeriesDeleting(false); return; }
    const check = await supabaseClient.from("experimental_series_drafts").select("id").eq("id", seriesDelete.id).maybeSingle();
    if (check.error || check.data) { setError(check.error?.message ?? "The Event Series still exists after deletion."); setSeriesDeleting(false); return; }
    const deletedIds = new Set(deleteConnections.map(item => item.id)); setSeries(items => items.filter(item => item.id !== seriesDelete.id)); setLinks(items => items.filter(item => item.series_id !== seriesDelete.id)); if (seriesImpact === "series_and_events") setEvents(items => items.filter(item => !deletedIds.has(item.id)));
    setNotice(seriesImpact === "series_and_events" ? `Deleted ${seriesDelete.name} and ${deleteConnections.length} connected events.` : `Deleted ${seriesDelete.name}; connected events are now ungrouped.`); setSeriesDelete(null); setSeriesPhrase(""); setSeriesImpact("series_only"); setSeriesDeleting(false);
  }

  const toolsPanel = <Stack spacing={2.5} p={2.25}>
    <Stack direction="row" alignItems="center" gap={1}><TuneOutlinedIcon color="secondary" /><Typography variant="h5">Management tools</Typography></Stack>
    <Divider />
    <Box component="section"><Typography variant="h6">Event Series</Typography><Typography variant="body2" color="text.secondary">Create, edit, connect, or safely delete groups without changing unrelated events.</Typography>
      <Box component="form" onSubmit={saveSeries} mt={1.5}><Stack spacing={1}><TextField label="Series name" value={seriesForm.name} onChange={event => setSeriesForm(value => ({ ...value, name: event.target.value }))} /><TextField label="Series code" value={seriesForm.code} onChange={event => setSeriesForm(value => ({ ...value, code: event.target.value }))} /><FormControl><InputLabel id="series-owner-label">Owner or coach</InputLabel><Select labelId="series-owner-label" label="Owner or coach" value={seriesForm.ownerId} onChange={event => setSeriesForm(value => ({ ...value, ownerId: event.target.value }))}><MenuItem value="">Unassigned</MenuItem>{owners.map(owner => <MenuItem key={owner.id} value={owner.id}>{owner.display_name}</MenuItem>)}</Select></FormControl><Stack direction="row" gap={1}><Button type="submit" variant="contained">{seriesForm.id ? "Save series" : "Create series"}</Button>{seriesForm.id && <Button onClick={() => setSeriesForm({ id: "", name: "", code: "", type: "recurring", ownerId: "" })}>Cancel</Button>}</Stack></Stack></Box>
      <Stack spacing={1} mt={1.5}>{series.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 1.25 }}><Typography fontWeight={800}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.series_code} · {item.primary_owner_draft_id ? ownerById.get(item.primary_owner_draft_id)?.display_name ?? "Unknown owner" : "Owner unassigned"}</Typography><Stack direction="row" gap={0.5} mt={0.75}><Button size="small" onClick={() => setSeriesForm({ id: item.id, name: item.name, code: item.series_code, type: item.series_type, ownerId: item.primary_owner_draft_id ?? "" })}>Edit</Button><Button size="small" color="error" onClick={() => { setSeriesDelete(item); setSeriesPhrase(""); setSeriesImpact("series_only"); }}>Delete Event Series</Button></Stack></Paper>)}</Stack>
    </Box>
    <Divider />
    <Box component="section"><Typography variant="h6">Owners and Coaches</Typography><Typography variant="body2" color="text.secondary">Add or correct the people shown on Event Series and event forms.</Typography>
      <Box component="form" onSubmit={saveOwner} mt={1.5}><Stack spacing={1}><TextField label="Name" value={ownerForm.name} onChange={event => setOwnerForm(value => ({ ...value, name: event.target.value }))} /><Stack direction="row" gap={1}><Button type="submit" variant="outlined">{ownerForm.id ? "Save person" : "Add person"}</Button>{ownerForm.id && <Button onClick={() => setOwnerForm({ id: "", name: "" })}>Cancel</Button>}</Stack></Stack></Box>
      <Stack spacing={0.75} mt={1.5}>{owners.map(item => <Stack key={item.id} direction="row" alignItems="center" justifyContent="space-between"><Typography variant="body2">{item.display_name}</Typography><Button size="small" onClick={() => setOwnerForm({ id: item.id, name: item.display_name })}>Edit</Button></Stack>)}</Stack>
    </Box>
  </Stack>;

  return <Stack spacing={2.5}>
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}><Box><Typography variant="h4" component="h1">Experimental Dashboard</Typography><Typography color="text.secondary">The familiar public event view, with verified owner management tools added.</Typography></Box><Stack direction="row" gap={1}><Button variant="contained" startIcon={<AddIcon />} onClick={() => void createEvent()}>New Event</Button>{!desktopTools && <Button variant="outlined" startIcon={<TuneOutlinedIcon />} onClick={() => setToolsOpen(true)}>Owner tools</Button>}</Stack></Stack>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 370px" }, gap: 2.5, alignItems: "start" }}>
      <Stack spacing={2.5} minWidth={0}>
        <Paper sx={{ p: 2.25 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}><Box><Typography variant="h5" component="h2">Event Series Review</Typography><Typography color="text.secondary">Recommendations remain pending until you deliberately confirm them. Every relationship is read back before it is marked saved.</Typography></Box><FormControlLabel control={<Checkbox checked={focusNext} onChange={event => setFocusNext(event.target.checked)} />} label="Focus next" /></Stack>
          <ToggleButtonGroup value={view} exclusive onChange={(_event, value: DashboardView | null) => value && setView(value)} aria-label="Dashboard event view" sx={{ mt: 2 }}><ToggleButton value="timeline">Timeline</ToggleButton><ToggleButton value="calendar">Calendar</ToggleButton><ToggleButton value="map">Map</ToggleButton></ToggleButtonGroup>
          <EventFilterBar search={search} onSearchChange={setSearch} styles={styles} style={style} onStyleChange={setStyle} states={states} state={stateFilter} onStateChange={setStateFilter} availableDaysOfWeek={days} selectedDayOfWeek={day} onSelectedDayOfWeekChange={setDay} areas={areas} onAreasChange={setAreas} relationship={relationship} onRelationshipChange={setRelationship} counts={{ all: events.length, ...counts }} shown={filtered.length} onReset={() => { setSearch(""); setStyle(""); setStateFilter(""); setDay(""); setRelationship("all"); setAreas(new Set(["Pensacola area", "Mobile area"])); }} />
        </Paper>
        {loading ? <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box> : !visible.length ? <Paper sx={{ p: 4, textAlign: "center" }}><Typography>No events match these filters.</Typography></Paper> : <Box className="event-grid">{visible.map(item => {
          const itemLinks = linksByEvent.get(item.id) ?? []; const seriesId = itemLinks.length === 1 ? itemLinks[0].series_id : ""; const selectedSeries = seriesById.get(seriesId); const pendingRecommendation = recommended[item.id] === seriesId && confirmed[item.id] !== seriesId; const saved = confirmed[item.id] === seriesId && Boolean(seriesId); const save = relationshipState[item.id];
          return <Paper key={item.id} component="article" sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.35, border: "1px solid", borderColor: "warning.main", boxShadow: "0 12px 35px rgba(0,0,0,.18)" }}>
            <Box position="relative"><EventFlyer event={item} url={flyerFor(item, flyerMap)} /><IconButton aria-label={`Open actions for ${item.name}`} onClick={event => openMenu(item, event.currentTarget)} sx={{ position: "absolute", top: 6, right: 6, bgcolor: "rgba(5,7,12,.78)" }}><MoreVertIcon /></IconButton></Box>
            <Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography><Chip size="small" label={item.record_status === "cancelled" ? "Cancelled" : item.record_status === "active" ? "Published" : item.record_status} color={item.record_status === "active" ? "success" : item.record_status === "cancelled" ? "error" : "default"} /></Stack>
            <Typography variant="body2">{formatDate(item)}{formatTime(item) ? ` · ${formatTime(item)}` : ""}</Typography><Typography color="text.secondary">{item.venue}{item.state ? ` · ${item.state}` : ""}</Typography><Typography variant="body2">Owner/coach: {ownerName(item, selectedSeries)}</Typography><Typography variant="body2">Event Series: {selectedSeries?.name ?? "Unlinked"}</Typography>
            <FormControl fullWidth><InputLabel id={`series-${item.id}`}>Event Series</InputLabel><Select data-series-event={item.id} labelId={`series-${item.id}`} label="Event Series" value={seriesId} onChange={event => void saveSeriesLink(item, event.target.value)} sx={{ minHeight: 44, "& .MuiSelect-select": { minHeight: "44px !important", boxSizing: "border-box", display: "flex", alignItems: "center" } }}><MenuItem value=""><em>No series</em></MenuItem>{series.map(option => <MenuItem key={option.id} value={option.id}>{option.name}{recommended[item.id] === option.id ? " — Recommended" : ""}</MenuItem>)}</Select>{itemLinks.length > 1 && <FormHelperText error>Multiple links found. Choose the one to keep.</FormHelperText>}</FormControl>
            {pendingRecommendation && <FormControlLabel control={<Checkbox aria-label={`Confirm recommended series for ${item.name}`} checked={false} onChange={event => event.target.checked && void saveSeriesLink(item, seriesId)} />} label="Use recommended series" />}{saved && <Chip size="small" color="success" variant="outlined" label="Linked / Saved" sx={{ alignSelf: "flex-start" }} />}<Box role="status" aria-live="polite" minHeight={20}>{save && <Typography variant="caption" color={save.state === "error" ? "error" : save.state === "saved" ? "success.main" : "text.secondary"}>{save.message}</Typography>}</Box>
          </Paper>;
        })}</Box>}
        {pageCount > 1 && <Stack alignItems="center"><Pagination page={page} count={pageCount} onChange={(_event, value) => setPage(value)} showFirstButton showLastButton /></Stack>}
      </Stack>
      {desktopTools && <Paper component="aside" aria-label="Owner management tools" sx={{ position: "sticky", top: 88, maxHeight: "calc(100vh - 112px)", overflowY: "auto" }}>{toolsPanel}</Paper>}
    </Box>
    <DataQualityInbox events={events} profile={profile} /><DraftReviewExperiment events={events} profile={profile} /><VolunteerPreviewExperiment events={events} people={people} assignments={assignments} />
    <Drawer anchor="right" open={!desktopTools && toolsOpen} onClose={() => setToolsOpen(false)} ModalProps={{ keepMounted: true }} sx={{ "& .MuiDrawer-paper": { width: "min(92vw,390px)" } }}>{toolsPanel}</Drawer>
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}><MenuItem onClick={() => menuEvent && void openEditor(menuEvent)}><EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Edit Event</MenuItem><MenuItem onClick={() => menuEvent && chooseFlyer(menuEvent)}><UploadFileOutlinedIcon fontSize="small" sx={{ mr: 1 }} />{menuEvent?.flyer_url ? "Change Flyer" : "Add Flyer"}</MenuItem>{menuEvent?.flyer_url && <MenuItem onClick={() => menuEvent && void removeFlyer(menuEvent)}><DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Remove Flyer</MenuItem>}<Divider />{menuEvent?.record_status !== "cancelled" && <MenuItem onClick={() => menuEvent && void cancelEvent(menuEvent)} sx={{ color: "error.main" }}><EventBusyOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Cancel Event</MenuItem>}</Menu><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadFlyer} />
    <Dialog open={Boolean(editorEvent)} onClose={() => setEditorEvent(null)} fullWidth maxWidth="md" fullScreen={mobileDialog}><DialogTitle>{editorEvent?.record_status === "draft" ? "New Event" : `Edit ${editorEvent?.name ?? "event"}`}</DialogTitle><DialogContent dividers><Stack spacing={2} pt={1}><Alert severity="info">Drafts autosave and remain private. Publishing is always a separate action.</Alert><Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "1fr 1fr" }} gap={2}><TextField label="Name" value={editorForm.name} onChange={event => setEditorForm(value => ({ ...value, name: event.target.value }))} /><TextField label="Dance style" value={editorForm.style} onChange={event => setEditorForm(value => ({ ...value, style: event.target.value }))} /><TextField label="Start date" value={editorForm.start_date} placeholder="YYYY-MM-DD" onChange={event => setEditorForm(value => ({ ...value, start_date: event.target.value }))} /><TextField label="End date" value={editorForm.end_date} placeholder="YYYY-MM-DD" onChange={event => setEditorForm(value => ({ ...value, end_date: event.target.value }))} /><TextField label="Start time" value={editorForm.start_time} onChange={event => setEditorForm(value => ({ ...value, start_time: event.target.value }))} /><TextField label="End time" value={editorForm.end_time} onChange={event => setEditorForm(value => ({ ...value, end_time: event.target.value }))} /><TextField label="Location" value={editorForm.venue} onChange={event => setEditorForm(value => ({ ...value, venue: event.target.value }))} /><TextField label="State" value={editorForm.state} onChange={event => setEditorForm(value => ({ ...value, state: event.target.value }))} />{editorEvent && <FormControl><InputLabel id="editor-series-label">Event Series</InputLabel><Select labelId="editor-series-label" label="Event Series" value={(linksByEvent.get(editorEvent.id) ?? []).length === 1 ? (linksByEvent.get(editorEvent.id) ?? [])[0].series_id : ""} onChange={event => void saveSeriesLink(editorEvent, event.target.value)}><MenuItem value="">Unlinked</MenuItem>{series.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>}{editorEvent && <FormControl><InputLabel id="editor-owner-label">Owner or coach</InputLabel><Select labelId="editor-owner-label" label="Owner or coach" value={managerScopes.find(scope => scope.event_id === editorEvent.id)?.manager_owner_draft_id ?? ""} onChange={event => void saveEventOwner(editorEvent, event.target.value)}><MenuItem value="">Unassigned</MenuItem>{owners.map(item => <MenuItem key={item.id} value={item.id}>{item.display_name}</MenuItem>)}</Select></FormControl>}<TextField label="Contact or website" value={editorForm.source_url} onChange={event => setEditorForm(value => ({ ...value, source_url: event.target.value }))} sx={{ gridColumn: { sm: "1 / -1" } }} /><TextField label="Description" multiline minRows={3} value={editorForm.notes} onChange={event => setEditorForm(value => ({ ...value, notes: event.target.value }))} sx={{ gridColumn: { sm: "1 / -1" } }} /></Box><Box role="status" aria-live="polite">{editorSave && <Typography color={editorSave.state === "error" ? "error" : editorSave.state === "saved" ? "success.main" : "text.secondary"}>{editorSave.message}</Typography>}</Box><Collapse in={preview}>{editorEvent && <Paper sx={{ p: 2, borderColor: "warning.main" }}><Typography variant="overline">Public preview</Typography><EventFlyer event={{ ...editorEvent, ...eventPayload(editorForm) }} url={flyerFor(editorEvent, flyerMap)} /><Typography variant="h5">{editorForm.name || "Untitled event"}</Typography><Typography>{editorForm.start_date || editorForm.day_of_week || "Schedule pending"} · {editorForm.venue || "Location pending"}</Typography><Typography color="text.secondary">{editorForm.notes}</Typography></Paper>}</Collapse></Stack></DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setEditorEvent(null)} disabled={publishing}>Close</Button><Button onClick={() => setPreview(value => !value)}>Preview</Button><Button variant="contained" onClick={() => void publishEvent()} disabled={publishing || editorSave?.state === "saving"}>{publishing ? "Publishing…" : "Publish"}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(seriesDelete)} onClose={() => !seriesDeleting && setSeriesDelete(null)} fullWidth maxWidth="sm"><DialogTitle>Delete Event Series</DialogTitle><DialogContent dividers><Stack spacing={2}><Alert severity="warning">Cancel is the safest choice. This action cannot be undone from the dashboard.</Alert><Typography><strong>Series:</strong> {seriesDelete?.name}</Typography><Typography><strong>Connected events:</strong> {deleteConnections.length}</Typography><Typography><strong>Date range:</strong> {deleteDates.length ? `${deleteDates[0]} – ${deleteDates[deleteDates.length - 1]}` : "No dated events"}</Typography><RadioGroup value={seriesImpact} onChange={event => setSeriesImpact(event.target.value as typeof seriesImpact)}><FormControlLabel value="series_only" control={<Radio />} label="Delete only the series and leave events ungrouped" /><FormControlLabel value="series_and_events" control={<Radio />} label={`Delete the series and all ${deleteConnections.length} connected events`} /></RadioGroup><TextField label="Type DELETE SERIES" value={seriesPhrase} onChange={event => setSeriesPhrase(event.target.value)} autoComplete="off" /></Stack></DialogContent><DialogActions><Button autoFocus onClick={() => setSeriesDelete(null)} disabled={seriesDeleting}>Cancel</Button><Button color="error" variant="contained" disabled={seriesPhrase !== "DELETE SERIES" || seriesDeleting} onClick={() => void deleteSeries()}>{seriesDeleting ? "Deleting…" : seriesImpact === "series_only" ? "Delete series only" : `Delete series and ${deleteConnections.length} events`}</Button></DialogActions></Dialog>
  </Stack>;
}

function eventsWithOneLink(links: EventLink[]): Array<[string, string]> { const grouped = new Map<string, string[]>(); links.forEach(link => grouped.set(link.event_id, [...(grouped.get(link.event_id) ?? []), link.series_id])); return [...grouped].flatMap(([eventId, ids]) => ids.length === 1 ? [[eventId, ids[0]]] : []); }
