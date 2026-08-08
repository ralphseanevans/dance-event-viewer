import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import LogoutIcon from "@mui/icons-material/Logout";
import { supabaseClient } from "../supabase";

export default function PendingAccess({ email }: { email: string }) {
  return (
    <Box minHeight="100dvh" display="grid" sx={{ placeItems: "center", p: 2.5 }}>
      <Paper sx={{ maxWidth: 520, p: { xs: 3, sm: 5 }, textAlign: "center", borderRadius: 5 }}>
        <Stack spacing={2.5} alignItems="center">
          <HourglassTopIcon color="primary" sx={{ fontSize: 50 }} />
          <Typography variant="h4" component="h1">Access awaiting approval</Typography>
          <Typography color="text.secondary">
            {email} signed in successfully, but the owner has not activated this dashboard profile yet.
          </Typography>
          <Button startIcon={<LogoutIcon />} onClick={() => void supabaseClient.auth.signOut()}>
            Sign out
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
