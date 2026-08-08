import { useEffect, useState } from "react";
import { Alert, Box, Chip, Paper, Skeleton, Stack, Typography } from "@mui/material";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import HistoryIcon from "@mui/icons-material/History";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import type { DashboardProfile } from "../types";
import { supabaseClient } from "../supabase";

interface Counts {
  events: number;
  assignments: number;
  activity: number;
  sources: number;
}

export default function OverviewPage({ profile }: { profile: DashboardProfile }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState("");
  const admin = profile.role === "owner_admin";

  useEffect(() => {
    const eventView = admin ? "dashboard_events_admin" : "dashboard_events";
    void Promise.all([
      supabaseClient.from(eventView).select("id", { count: "exact", head: true }),
      supabaseClient.from("event_assignments").select("id", { count: "exact", head: true }).eq("active", true),
      supabaseClient.from("dashboard_activity").select("id", { count: "exact", head: true }),
      supabaseClient.from("dashboard_source_history").select("id", { count: "exact", head: true }),
    ]).then((results) => {
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) setError(firstError.message);
      setCounts({
        events: results[0].count ?? 0,
        assignments: results[1].count ?? 0,
        activity: results[2].count ?? 0,
        sources: results[3].count ?? 0,
      });
    });
  }, [admin]);

  const cards = [
    { label: admin ? "All event records" : "Assigned event records", value: counts?.events, icon: <EventAvailableIcon color="primary" /> },
    { label: admin ? "Active assignments" : "Your assignments", value: counts?.assignments, icon: <AssignmentIndIcon color="secondary" /> },
    { label: "Visible activity entries", value: counts?.activity, icon: <HistoryIcon color="warning" /> },
    { label: "Source observations", value: counts?.sources, icon: <TravelExploreIcon color="success" /> },
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="h4" component="h1">Welcome back</Typography>
            <Typography color="text.secondary" mt={0.5}>
              {admin ? "You have full owner access." : "Only assigned records are visible and editable."}
            </Typography>
          </Box>
          <Chip label="Supabase RLS enforced" color="success" variant="outlined" sx={{ alignSelf: "flex-start" }} />
        </Stack>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Box className="stat-grid">
        {cards.map((card) => (
          <Paper key={card.label} sx={{ p: 2.5, minHeight: 145 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Typography color="text.secondary" fontWeight={650}>{card.label}</Typography>
              {card.icon}
            </Stack>
            {counts ? (
              <Typography variant="h3" mt={2} fontWeight={850}>{card.value}</Typography>
            ) : (
              <Skeleton width={80} height={64} />
            )}
          </Paper>
        ))}
      </Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Security model</Typography>
        <Typography color="text.secondary">
          Authentication proves identity. Database profiles define roles. Active assignments define volunteer access.
          The database rejects unauthorized requests even if someone bypasses this interface.
        </Typography>
      </Paper>
    </Stack>
  );
}
