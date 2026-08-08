import { useMemo, useState } from "react";
import { Alert, Autocomplete, Chip, Paper, Stack, Typography } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import type { DashboardEvent, DashboardProfile, EventAssignment } from "../types";
import ExperimentStatus from "./ExperimentStatus";

export default function VolunteerPreviewExperiment({ events, people, assignments }: {
  events: DashboardEvent[]; people: DashboardProfile[]; assignments: EventAssignment[];
}) {
  const volunteers = useMemo(() => people.filter(person => person.role === "volunteer" && person.active), [people]);
  const [selected, setSelected] = useState<DashboardProfile | null>(null);
  const assignedIds = useMemo(() => new Set(assignments.filter(item => item.active && item.user_id === selected?.id).map(item => item.event_id)), [assignments, selected]);
  const visibleEvents = useMemo(() => events.filter(event => assignedIds.has(event.id)), [assignedIds, events]);
  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <VisibilityOutlinedIcon color="primary" />
        <Typography variant="h6">View as Volunteer</Typography>
        <ExperimentStatus status="live" />
      </Stack>
      <Typography color="text.secondary" variant="body2" mt={0.5} mb={2}>
        Read-only permission preview using current assignments. It never signs in as, impersonates, or records actions under another person.
      </Typography>
      {!volunteers.length && <Alert severity="info">No active volunteers exist yet. This preview will become selectable after you approve a volunteer account.</Alert>}
      {!!volunteers.length && <Autocomplete options={volunteers} value={selected} onChange={(_event, next) => setSelected(next)}
        getOptionLabel={person => person.display_name || person.email}
        renderInput={params => <TextFieldShim {...params} />} />}
      {selected && <Stack spacing={1.25} mt={2}>
        <Stack direction="row" gap={1} flexWrap="wrap"><Chip label={`${visibleEvents.length} assigned events`} /><Chip label="Can edit assigned event details" variant="outlined" /><Chip label="Cannot manage people or permissions" variant="outlined" /></Stack>
        {!visibleEvents.length ? <Typography color="text.secondary">This volunteer currently has no active event assignments.</Typography> : visibleEvents.map(event => <Paper key={event.id} variant="outlined" sx={{ p: 1.5 }}><Typography fontWeight={800}>{event.name}</Typography><Typography variant="body2" color="text.secondary">{event.venue} · {event.event_key}</Typography></Paper>)}
      </Stack>}
    </Paper>
  );
}

import TextField from "@mui/material/TextField";
function TextFieldShim(params: React.ComponentProps<typeof TextField>) { return <TextField {...params} label="Volunteer to preview" />; }
