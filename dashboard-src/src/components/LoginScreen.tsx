import { FormEvent, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { authRedirectUrl, supabaseClient } from "../supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const { error: authError } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl, shouldCreateUser: true },
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else setMessage("Check your email for a secure sign-in link.");
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    const { error: authError } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl },
    });
    if (authError) {
      setBusy(false);
      setError(authError.message);
    }
  }

  return (
    <Box minHeight="100dvh" display="grid" sx={{ placeItems: "center", p: 2.5 }}>
      <Paper elevation={18} sx={{ width: "min(100%, 470px)", p: { xs: 3, sm: 4.5 }, borderRadius: 5 }}>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="overline" color="primary.light" fontWeight={800}>
                Dance Event Viewer
              </Typography>
              <Typography variant="h4" component="h1" fontWeight={850}>
                Secure dashboard
              </Typography>
            </Box>
            <Chip icon={<ShieldOutlinedIcon />} label="Protected" color="success" variant="outlined" />
          </Stack>
          <Typography color="text.secondary">
            Owner and volunteer access. Your database permissions are checked on every request.
          </Typography>
          <Button
            size="large"
            variant="outlined"
            startIcon={<GoogleIcon />}
            onClick={() => void signInWithGoogle()}
            disabled={busy}
            sx={{ minHeight: 48 }}
          >
            Continue with Google
          </Button>
          <Divider>or use an email link</Divider>
          <Box component="form" onSubmit={sendMagicLink}>
            <Stack spacing={2}>
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                fullWidth
              />
              <Button
                type="submit"
                size="large"
                variant="contained"
                startIcon={<MailOutlineIcon />}
                disabled={busy || !email.trim()}
                sx={{ minHeight: 48 }}
              >
                Email me a sign-in link
              </Button>
            </Stack>
          </Box>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="caption" color="text.secondary">
            New accounts stay inactive until the owner assigns access. No shared dashboard password is used.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
