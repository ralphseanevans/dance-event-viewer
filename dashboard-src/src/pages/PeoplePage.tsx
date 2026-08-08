import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import type { DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";

interface OwnerDraft { id: string; display_name: string; }
interface OwnerManagerDraft { id: string; manager_profile_id: string | null; manager_owner_draft_id: string | null; owner_draft_id: string; }

export default function PeoplePage({ profile }: { profile: DashboardProfile }) {
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);
  const [owners, setOwners] = useState<OwnerDraft[]>([]);
  const [ownerManagers, setOwnerManagers] = useState<OwnerManagerDraft[]>([]);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const ownerAdmin = profile.role === "owner_admin";
    const [profilesResult, ownersResult, managersResult] = await Promise.all([
      supabaseClient.from("dashboard_profiles").select("*").order("created_at", { ascending: false }),
      ownerAdmin ? supabaseClient.from("experimental_owner_drafts").select("id,display_name").order("display_name") : Promise.resolve({ data: [], error: null }),
      ownerAdmin ? supabaseClient.from("experimental_manager_scope_drafts").select("id,manager_profile_id,manager_owner_draft_id,owner_draft_id").eq("scope_type", "owner") : Promise.resolve({ data: [], error: null }),
    ]);
    const firstError = [profilesResult, ownersResult, managersResult].find(result => result.error)?.error;
    if (firstError) setError(firstError.message);
    setProfiles((profilesResult.data as DashboardProfile[] | null) ?? []);
    setOwners((ownersResult.data as OwnerDraft[] | null) ?? []);
    setOwnerManagers((managersResult.data as OwnerManagerDraft[] | null) ?? []);
    setLoading(false);
  }, [profile.role]);

  useEffect(() => { void load(); }, [load]);

  async function setActive(target: DashboardProfile, active: boolean) {
    setError("");
    const { error: updateError } = await supabaseClient
      .from("dashboard_profiles")
      .update({ active })
      .eq("id", target.id);
    if (updateError) setError(updateError.message);
    else await load();
  }

  async function setRole(target: DashboardProfile, role: "volunteer_admin" | "volunteer") {
    setError("");
    const { error: updateError } = await supabaseClient.from("dashboard_profiles").update({ role }).eq("id", target.id);
    if (updateError) setError(updateError.message); else await load();
  }

  async function addOwnerManagers() {
    if (!selectedOwner || !selectedManagers.length) return;
    setError("");
    const payload = selectedManagers.map(manager => ({
      manager_profile_id: manager.startsWith("profile:") ? manager.slice(8) : null,
      manager_owner_draft_id: manager.startsWith("owner:") ? manager.slice(6) : null,
      scope_type: "owner",
      owner_draft_id: selectedOwner,
      series_id: null,
      event_id: null,
      created_by: profile.id,
    }));
    const { error: insertError } = await supabaseClient.from("experimental_manager_scope_drafts").insert(payload);
    if (insertError) setError(insertError.message);
    else { setSelectedManagers([]); await load(); }
  }

  const managerName = (item: OwnerManagerDraft) => item.manager_owner_draft_id
    ? owners.find(owner => owner.id === item.manager_owner_draft_id)?.display_name ?? "Unknown person"
    : profiles.find(person => person.id === item.manager_profile_id)?.display_name ?? profiles.find(person => person.id === item.manager_profile_id)?.email ?? "Unknown account";
  const ownerName = (ownerId: string) => owners.find(owner => owner.id === ownerId)?.display_name ?? "Unknown owner";
  const ownerAdmin = profile.role === "owner_admin";

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">People</Typography>
        <Typography color="text.secondary">Activate volunteers after confirming their identity. New sign-ins start inactive.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {ownerAdmin && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6">Owner managers</Typography>
          <Typography color="text.secondary" mb={1.5}>Choose an owner, then select everyone who may eventually maintain that owner’s events and series. These assignments remain drafts and grant no live access yet.</Typography>
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5}>
            <FormControl fullWidth><InputLabel id="owner-manager-owner-label">Owner</InputLabel><Select labelId="owner-manager-owner-label" label="Owner" value={selectedOwner} onChange={event => setSelectedOwner(event.target.value)}>{owners.map(owner => <MenuItem key={owner.id} value={owner.id}>{owner.display_name}</MenuItem>)}</Select></FormControl>
            <FormControl fullWidth><InputLabel id="owner-manager-people-label">Managers</InputLabel><Select labelId="owner-manager-people-label" label="Managers" multiple value={selectedManagers} onChange={event => setSelectedManagers(typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value)} renderValue={selected => selected.map(value => value.startsWith("owner:") ? owners.find(owner => owner.id === value.slice(6))?.display_name : profiles.find(person => person.id === value.slice(8))?.display_name || profiles.find(person => person.id === value.slice(8))?.email).filter(Boolean).join(", ")}>{owners.map(owner => <MenuItem key={`owner:${owner.id}`} value={`owner:${owner.id}`}>{owner.display_name}</MenuItem>)}{profiles.map(person => <MenuItem key={`profile:${person.id}`} value={`profile:${person.id}`}>{person.display_name || person.email} (dashboard account)</MenuItem>)}</Select></FormControl>
            <Button variant="outlined" disabled={!selectedOwner || !selectedManagers.length} onClick={() => void addOwnerManagers()}>Add managers</Button>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" mt={2}>{ownerManagers.map(item => <Chip key={item.id} label={`${managerName(item)} manages ${ownerName(item.owner_draft_id)}`} />)}</Stack>
        </Paper>
      )}
      {loading ? <CircularProgress /> : (
        <Stack spacing={1.5}>
          {profiles.map((person) => (
            <Paper key={person.id} sx={{ p: 2.25 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2}>
                <Box minWidth={0}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={750} sx={{ overflowWrap: "anywhere" }}>{person.display_name || person.email}</Typography>
                    <Chip size="small" label={person.role === "owner_admin" ? "Owner admin" : person.role === "volunteer_admin" ? "Volunteer admin" : "Volunteer"} color={person.role === "owner_admin" ? "primary" : person.role === "volunteer_admin" ? "secondary" : "default"} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{person.email}</Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1}>
                  {ownerAdmin && person.role !== "owner_admin" && person.id !== profile.id && (
                    <FormControl size="small" sx={{ minWidth: 170 }}><InputLabel id={`role-${person.id}`}>Access level</InputLabel><Select labelId={`role-${person.id}`} label="Access level" value={person.role} onChange={event => void setRole(person, event.target.value as "volunteer_admin" | "volunteer")}><MenuItem value="volunteer">Volunteer</MenuItem><MenuItem value="volunteer_admin">Volunteer admin</MenuItem></Select></FormControl>
                  )}
                  <Typography variant="body2" color="text.secondary">{person.active ? "Active" : "Inactive"}</Typography>
                  <Switch
                    checked={person.active}
                    disabled={person.id === profile.id || person.role === "owner_admin" || (profile.role === "volunteer_admin" && person.role !== "volunteer")}
                    onChange={(event) => void setActive(person, event.target.checked)}
                    inputProps={{ "aria-label": `${person.active ? "Deactivate" : "Activate"} ${person.email}` }}
                  />
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
