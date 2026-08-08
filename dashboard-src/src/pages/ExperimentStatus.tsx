import { Box, Chip, Stack, Typography } from "@mui/material";

export type ExperimentStatusValue = "not_started" | "live" | "under_review" | "approved" | "blocked";

const statusDefinition: Record<ExperimentStatusValue, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "#9ca3af" },
  live: { label: "Live experimental test", color: "#42a5f5" },
  under_review: { label: "Under review", color: "#ffb74d" },
  approved: { label: "Approved for promotion", color: "#66bb6a" },
  blocked: { label: "Blocked", color: "#ef5350" },
};

export default function ExperimentStatus({ status, compact = false }: { status: ExperimentStatusValue; compact?: boolean }) {
  const definition = statusDefinition[status];
  return (
    <Chip
      size="small"
      variant="outlined"
      aria-label={`Experiment status: ${definition.label}`}
      label={(
        <Stack component="span" direction="row" spacing={0.75} alignItems="center">
          <Box
            component="span"
            aria-hidden="true"
            sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: definition.color, flex: "0 0 auto" }}
          />
          {!compact && <Typography component="span" variant="caption" fontWeight={800}>{definition.label}</Typography>}
        </Stack>
      )}
      sx={{ borderColor: definition.color, minHeight: 28 }}
    />
  );
}

