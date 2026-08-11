import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddTaskIcon from "@mui/icons-material/AddTask";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import type { DashboardEvent, DashboardProfile, EventAssignment } from "../types";
import { supabaseClient } from "../supabase";
import { firstErrorMessage, rowsOf } from "../lib/queries";

export default function AssignmentsPage({ profile }: { profile: DashboardProfile }) {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [people, setPeople] = useState<DashboardProfile[]>([]);
  const [assignments, setAssignments] = useState<EventAssignment[]>([]);
  const [eventId, setEventId] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [eventResult, peopleResult, assignmentResult] = await Promise.all([
      supabaseClient.from("dashboard_events_admin").select("id,event_key,name,record_status,updated_at").neq("record_status", "archived").order("name"),
      supabaseClient.from("dashboard_profiles").select("*").eq("role", "volunteer").eq("active", true).order("email"),
      supabaseClient.from("event_assignments").select("*").eq("active", true).order("assigned_at", { ascending: false }),
    ]);
    const failure = firstErrorMessage([eventResult, peopleResult, assignmentResult]);
    if (failure) setError(failure);
    setEvents(rowsOf<DashboardEvent>(eventResult));
    setPeople(rowsOf<DashboardProfile>(peopleResult));
    setAssignments(rowsOf<EventAssignment>(assignmentResult));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const eventNames = useMemo(() => new Map(events.map((event) => [event.id, event.name])), [events]);
  const peopleNames = useMemo(() => new Map(people.map((person) => [person.id, person.display_name || person.email])), [people]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!eventId || !userId) return;
    setError("");
    const { error: upsertError } = await supabaseClient.from("event_assignments").upsert({
      event_id: eventId,
      user_id: userId,
      assigned_by: profile.id,
      active: true,
      ended_at: null,
    }, { onConflict: "event_id,user_id" });
    if (upsertError) setError(upsertError.message);
    else {
      setEventId("");
      setUserId("");
      await load();
    }
  }

  async function revoke(assignment: EventAssignment) {
    const { error: updateError } = await supabaseClient
      .from("event_assignments")
      .update({ active: false, ended_at: new Date().toISOString() })
      .eq("id", assignment.id);
    if (updateError) setError(updateError.message);
    else await load();
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" component="h1">Assignments</Typography>
        <Typography color="text.secondary">Volunteer visibility follows active assignments immediately.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper component="form" onSubmit={assign} sx={{ p: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "center" }}>
          <Autocomplete
            fullWidth
            options={events}
            value={events.find((item) => item.id === eventId) ?? null}
            onChange={(_event, item) => setEventId(item?.id ?? "")}
            getOptionLabel={(item) => `${item.name} — ${item.event_key}`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => <TextField {...params} label="Event" placeholder="Search event name or key" />}
          />
          <Autocomplete
            fullWidth
            options={people}
            value={people.find((person) => person.id === userId) ?? null}
            onChange={(_event, person) => setUserId(person?.id ?? "")}
            getOptionLabel={(person) => person.display_name || person.email}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            noOptionsText="No active volunteers"
            renderInput={(params) => <TextField {...params} label="Volunteer" placeholder="Search active volunteers" />}
          />
          <Button type="submit" variant="contained" startIcon={<AddTaskIcon />} disabled={!eventId || !userId} sx={{ minWidth: 140, minHeight: 42 }}>
            Assign
          </Button>
        </Stack>
      </Paper>
      {!people.length && (
        <Typography color="text.secondary">
          No active volunteers yet. Activate a signed-in volunteer on the People page before assigning events.
        </Typography>
      )}
      <Stack spacing={1.25}>
        {assignments.map((assignment) => (
          <Paper key={assignment.id} sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5}>
              <Box>
                <Typography fontWeight={750}>{eventNames.get(assignment.event_id) || assignment.event_id}</Typography>
                <Typography color="text.secondary" variant="body2">{peopleNames.get(assignment.user_id) || assignment.user_id}</Typography>
              </Box>
              <Button color="warning" startIcon={<PersonRemoveOutlinedIcon />} onClick={() => void revoke(assignment)}>End assignment</Button>
            </Stack>
          </Paper>
        ))}
        {!assignments.length && <Typography color="text.secondary">No active volunteer assignments.</Typography>}
      </Stack>
    </Stack>
  );
}
