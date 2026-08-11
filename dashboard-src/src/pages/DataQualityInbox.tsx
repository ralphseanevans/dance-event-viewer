import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, TextField, Typography,
} from "@mui/material";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import type { DashboardEvent, DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";
import { rowsOf } from "../lib/queries";
import ExperimentStatus from "./ExperimentStatus";
import { buildDataQualityFindings, type DataQualityFinding, type DataQualityKind } from "./ExperimentalDataQuality";

type Decision = "open" | "deferred" | "dismissed" | "resolved";
interface StoredDecision { event_id: string; finding_key: DataQualityKind; decision: Decision; note: string; }

const labels: Record<DataQualityKind, string> = {
  missing_flyer: "Missing flyer",
  invalid_source_url: "Source link",
  stale_verification: "Stale verification",
  incomplete_location: "Location",
  suspicious_time: "Time",
  possible_duplicate: "Possible duplicate",
};

export default function DataQualityInbox({ events, profile }: { events: DashboardEvent[]; profile: DashboardProfile }) {
  const [decisions, setDecisions] = useState<StoredDecision[]>([]);
  const [kind, setKind] = useState<"all" | DataQualityKind>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const loadDecisions = useCallback(async () => {
    const result = await supabaseClient
      .from("experimental_data_quality_decisions")
      .select("event_id,finding_key,decision,note");
    if (result.error) setError(result.error.message);
    else setDecisions(rowsOf<StoredDecision>(result));
  }, []);

  useEffect(() => { void loadDecisions(); }, [loadDecisions]);

  const decisionMap = useMemo(() => new Map(decisions.map(item => [`${item.event_id}:${item.finding_key}`, item])), [decisions]);
  const allFindings = useMemo(() => buildDataQualityFindings(events), [events]);
  const findings = useMemo(() => allFindings.filter(item => {
    const decision = decisionMap.get(item.key)?.decision ?? "open";
    return (kind === "all" || item.kind === kind) && (showClosed || decision === "open" || decision === "deferred");
  }), [allFindings, decisionMap, kind, showClosed]);

  async function decide(finding: DataQualityFinding, decision: Decision) {
    setSaving(finding.key); setError("");
    const existing = decisionMap.get(finding.key);
    const payload = { decision, note: notes[finding.key]?.trim() ?? "", updated_by: profile.id };
    const result = existing
      ? await supabaseClient.from("experimental_data_quality_decisions").update(payload)
        .eq("event_id", finding.eventId).eq("finding_key", finding.kind)
      : await supabaseClient.from("experimental_data_quality_decisions").insert({
        event_id: finding.eventId, finding_key: finding.kind, created_by: profile.id, ...payload,
      });
    const saveError = result.error;
    if (saveError) setError(saveError.message);
    else await loadDecisions();
    setSaving("");
  }

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5} mb={2}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <FactCheckOutlinedIcon color="primary" />
            <Typography variant="h6">Data Quality Inbox</Typography>
            <ExperimentStatus status="live" />
          </Stack>
          <Typography color="text.secondary" variant="body2" mt={0.5}>
            Deterministic review suggestions only. Decisions are audited and never edit an event or public listing.
          </Typography>
          <Typography color="text.secondary" variant="caption">
            “Mark corrected” records your review after you fix the event elsewhere; this experiment never changes event data.
          </Typography>
        </Box>
        <Chip label={`${findings.length} shown · ${allFindings.length} total`} variant="outlined" />
      </Stack>
      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} mb={2}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="quality-kind-label">Finding type</InputLabel>
          <Select labelId="quality-kind-label" label="Finding type" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
            <MenuItem value="all">All finding types</MenuItem>
            {(Object.keys(labels) as DataQualityKind[]).map(value => <MenuItem key={value} value={value}>{labels[value]}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="outlined" aria-pressed={showClosed} onClick={() => setShowClosed(value => !value)}>
          {showClosed ? "Hide closed decisions" : "Show closed decisions"}
        </Button>
      </Stack>
      {!findings.length ? <Typography color="text.secondary">No findings match these filters.</Typography> : (
        <Stack spacing={1.5}>
          {findings.slice(0, 100).map(finding => {
            const current = decisionMap.get(finding.key)?.decision ?? "open";
            return (
              <Paper key={finding.key} variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
                  <Box minWidth={0}>
                    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                      <Chip size="small" label={labels[finding.kind]} color={finding.kind === "possible_duplicate" ? "warning" : "default"} />
                      <Chip size="small" label={current} variant="outlined" />
                    </Stack>
                    <Typography fontWeight={850} mt={1}>{finding.eventName}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{finding.eventKey}</Typography>
                    <Typography mt={0.75}>{finding.detail}</Typography>
                  </Box>
                  <Stack gap={1} sx={{ minWidth: { md: 330 } }}>
                    <TextField
                      size="small"
                      label="Review note (optional)"
                      value={notes[finding.key] ?? decisionMap.get(finding.key)?.note ?? ""}
                      onChange={event => setNotes(value => ({ ...value, [finding.key]: event.target.value }))}
                    />
                    <Stack direction="row" gap={1} flexWrap="wrap">
                      <Button disabled={saving === finding.key} onClick={() => void decide(finding, "deferred")}>Defer</Button>
                      <Button disabled={saving === finding.key} onClick={() => void decide(finding, "dismissed")}>Dismiss</Button>
                      <Button variant="contained" disabled={saving === finding.key} onClick={() => void decide(finding, "resolved")}>Mark corrected</Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
