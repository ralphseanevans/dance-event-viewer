import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import { rowsOf } from "../lib/queries";
import ExperimentStatus from "./ExperimentStatus";

type ReviewStatus = "draft" | "in_review" | "approved" | "rejected";
interface ChangeDraft {
  id: string; event_id: string; proposed_changes: Record<string, string>; note: string;
  review_status: ReviewStatus; created_at: string; updated_at: string;
}

const editableFields: Array<keyof Pick<DashboardEvent, "name" | "venue" | "start_time" | "end_time" | "cost" | "notes">> =
  ["name", "venue", "start_time", "end_time", "cost", "notes"];

export default function DraftReviewExperiment({ events, profile }: { events: DashboardEvent[]; profile: DashboardProfile }) {
  const [drafts, setDrafts] = useState<ChangeDraft[]>([]);
  const [selected, setSelected] = useState<DashboardEvent | null>(null);
  const [field, setField] = useState<(typeof editableFields)[number]>("notes");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await supabaseClient.from("experimental_event_change_drafts")
      .select("id,event_id,proposed_changes,note,review_status,created_at,updated_at")
      .order("updated_at", { ascending: false }).limit(100);
    if (result.error) setError(result.error.message); else setDrafts(rowsOf<ChangeDraft>(result));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const eventMap = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);

  async function createDraft() {
    if (!selected || !value.trim()) return;
    setSaving(true); setError("");
    const { error: saveError } = await supabaseClient.from("experimental_event_change_drafts").insert({
      event_id: selected.id, proposed_changes: { [field]: value.trim() }, note: note.trim(), created_by: profile.id,
    });
    if (saveError) setError(saveError.message);
    else { setSelected(null); setValue(""); setNote(""); await load(); }
    setSaving(false);
  }

  async function setStatus(id: string, review_status: ReviewStatus) {
    setSaving(true); setError("");
    const { error: saveError } = await supabaseClient.from("experimental_event_change_drafts")
      .update({ review_status, reviewed_by: review_status === "approved" || review_status === "rejected" ? profile.id : null })
      .eq("id", id);
    if (saveError) setError(saveError.message); else await load();
    setSaving(false);
  }

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <RateReviewOutlinedIcon color="secondary" />
        <Typography variant="h6">Draft, Review, Publish</Typography>
        <ExperimentStatus status="live" />
      </Stack>
      <Typography color="text.secondary" variant="body2" mt={0.5} mb={2}>
        Test proposed changes and approvals side by side. “Approve” is a simulation here and never writes to the public event.
      </Typography>
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} gap={1.25} mb={2}>
        <Autocomplete fullWidth options={events} value={selected} onChange={(_event, next) => setSelected(next)}
          getOptionLabel={event => `${event.name} — ${event.venue}`}
          renderInput={params => <TextField {...params} label="Event to change" />} />
        <TextField select SelectProps={{ native: true }} label="Field" value={field} onChange={event => setField(event.target.value as typeof field)} sx={{ minWidth: 150 }}>
          {editableFields.map(item => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
        </TextField>
        <TextField fullWidth label="Proposed value" value={value} onChange={event => setValue(event.target.value)} />
        <TextField fullWidth label="Reason (optional)" value={note} onChange={event => setNote(event.target.value)} />
        <Button variant="contained" disabled={!selected || !value.trim() || saving} onClick={() => void createDraft()}>Save draft</Button>
      </Stack>
      {!drafts.length ? <Typography color="text.secondary">No experimental change drafts yet.</Typography> : (
        <Stack spacing={1.25}>
          {drafts.map(draft => {
            const event = eventMap.get(draft.event_id);
            const entries = Object.entries(draft.proposed_changes);
            return <Paper key={draft.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
                <Box minWidth={0}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography fontWeight={850}>{event?.name ?? draft.event_id}</Typography><Chip size="small" label={draft.review_status.replace("_", " ")} /></Stack>
                  {entries.map(([name, proposed]) => <Box key={name} mt={1}><Typography variant="caption" color="text.secondary">{name.replace("_", " ")}</Typography><Typography sx={{ textDecoration: "line-through", color: "text.secondary" }}>{String(event?.[name as keyof DashboardEvent] ?? "") || "(empty)"}</Typography><Typography fontWeight={750}>{proposed || "(empty)"}</Typography></Box>)}
                  {draft.note && <Typography variant="body2" mt={1}>Reason: {draft.note}</Typography>}
                </Box>
                <Stack direction="row" gap={1} flexWrap="wrap" alignContent="flex-start">
                  <Button disabled={saving} onClick={() => void setStatus(draft.id, "in_review")}>Review</Button>
                  <Button color="error" disabled={saving} onClick={() => void setStatus(draft.id, "rejected")}>Reject</Button>
                  <Button variant="contained" color="success" disabled={saving} onClick={() => void setStatus(draft.id, "approved")}>Approve simulation</Button>
                </Stack>
              </Stack>
            </Paper>;
          })}
        </Stack>
      )}
    </Paper>
  );
}
