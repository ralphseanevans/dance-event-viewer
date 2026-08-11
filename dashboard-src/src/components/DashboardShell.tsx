import { lazy, ReactNode, Suspense, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LogoutIcon from "@mui/icons-material/Logout";
import type { DashboardProfile, DashboardSection } from "../types";
import { supabaseClient } from "../supabase";
import { isAdmin, isOwnerAdmin } from "../lib/queries";
const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const EventsPage = lazy(() => import("../pages/EventsPage"));
const PeoplePage = lazy(() => import("../pages/PeoplePage"));
const AssignmentsPage = lazy(() => import("../pages/AssignmentsPage"));
const ActivityPage = lazy(() => import("../pages/ActivityPage"));
const SourcesPage = lazy(() => import("../pages/SourcesPage"));
const CrawlersPage = lazy(() => import("../pages/CrawlersPage"));
const ExperimentalPage = lazy(() => import("../pages/ExperimentalPage"));

const drawerWidth = 260;

function textMetadataValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function googleAvatarUrl(session: Session) {
  const googleIdentity = session.user.identities?.find((identity) => identity.provider === "google");
  const identityData = googleIdentity?.identity_data;
  const userMetadata = session.user.user_metadata;
  return textMetadataValue(identityData?.avatar_url)
    ?? textMetadataValue(identityData?.picture)
    ?? textMetadataValue(userMetadata?.avatar_url)
    ?? textMetadataValue(userMetadata?.picture);
}

const items: Array<{ key: DashboardSection; label: string; icon: ReactNode; admin?: boolean; ownerOnly?: boolean }> = [
  { key: "overview", label: "Overview", icon: <DashboardOutlinedIcon /> },
  { key: "events", label: "Events", icon: <EventNoteOutlinedIcon /> },
  { key: "people", label: "People", icon: <PeopleOutlineIcon />, admin: true },
  { key: "assignments", label: "Assignments", icon: <AssignmentIndOutlinedIcon />, admin: true },
  { key: "activity", label: "Activity", icon: <HistoryOutlinedIcon /> },
  { key: "sources", label: "Source history", icon: <TravelExploreOutlinedIcon /> },
  { key: "crawlers", label: "Crawler runs", icon: <SmartToyOutlinedIcon />, admin: true },
  { key: "experimental", label: "Experimental Dashboard", icon: <ScienceOutlinedIcon />, ownerOnly: true },
];

export default function DashboardShell({ session, profile }: { session: Session; profile: DashboardProfile }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [section, setSection] = useState<DashboardSection>("overview");
  const ownerAdmin = isOwnerAdmin(profile);
  const admin = isAdmin(profile);
  const avatarUrl = googleAvatarUrl(session);
  const signedInWithGoogle = session.user.identities?.some((identity) => identity.provider === "google") ?? false;
  const signedInLabel = signedInWithGoogle
    ? `Signed in with Google as ${session.user.email ?? "this account"}`
    : session.user.email ?? "Signed-in user";
  const visibleItems = useMemo(() => items.filter((item) => (!item.admin || admin) && (!item.ownerOnly || ownerAdmin)), [admin, ownerAdmin]);

  const content = {
    overview: <OverviewPage profile={profile} />,
    events: <EventsPage profile={profile} />,
    people: <PeoplePage profile={profile} />,
    assignments: <AssignmentsPage profile={profile} />,
    activity: <ActivityPage profile={profile} />,
    sources: <SourcesPage profile={profile} />,
    crawlers: <CrawlersPage profile={profile} />,
    experimental: <ExperimentalPage profile={profile} />,
  }[section];

  const drawer = (
    <Stack height="100%">
      <Box p={2.5}>
        <Typography variant="overline" color="primary.light" fontWeight={850}>Dance Event Viewer</Typography>
        <Typography variant="h6" fontWeight={850}>Dashboard</Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1.25, py: 1.5, flex: 1 }}>
        {visibleItems.map((item) => (
          <ListItemButton
            key={item.key}
            selected={section === item.key}
            onClick={() => {
              setSection(item.key);
              setMobileOpen(false);
            }}
            sx={{ borderRadius: 2.5, mb: 0.5, minHeight: 46 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Stack spacing={1.5} p={2}>
        <Button
          href="../"
          target="_blank"
          rel="noopener"
          startIcon={<OpenInNewIcon />}
          variant="outlined"
          fullWidth
        >
          Public viewer
        </Button>
        <Button startIcon={<LogoutIcon />} onClick={() => void supabaseClient.auth.signOut()} fullWidth>
          Sign out
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <Box minHeight="100dvh">
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          ml: { md: `${drawerWidth}px` },
          width: { md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar>
          {!desktop && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation" sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 800 }}>{items.find((item) => item.key === section)?.label}</Typography>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Chip size="small" color={admin ? "primary" : "default"} label={ownerAdmin ? "Owner admin" : profile.role === "volunteer_admin" ? "Volunteer admin" : "Volunteer"} sx={{ display: { xs: "none", sm: "inline-flex" } }} />
            <Tooltip title={signedInLabel}>
              <Avatar
                src={avatarUrl}
                alt={avatarUrl ? `Google profile photo for ${session.user.email ?? "signed-in user"}` : undefined}
                aria-label={signedInLabel}
                sx={{ width: 34, height: 34, bgcolor: "secondary.dark" }}
              >
                {(profile.display_name || session.user.email || "U").slice(0, 1).toUpperCase()}
              </Avatar>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box component="nav" aria-label="Dashboard navigation">
        <Drawer
          variant={desktop ? "permanent" : "temporary"}
          open={desktop || mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box", bgcolor: "rgba(10,13,21,.97)" },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ ml: { md: `${drawerWidth}px` }, pt: 8, minHeight: "100dvh" }}>
        <Box sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1500, mx: "auto" }}>
          <Suspense fallback={<Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress aria-label="Loading section" /></Box>}>
            {content}
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}
