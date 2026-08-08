import { alpha, createTheme } from "@mui/material/styles";

export const dashboardTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#7c8cff", light: "#aab5ff" },
    secondary: { main: "#39d8c0" },
    background: { default: "#090b12", paper: "#111520" },
    error: { main: "#ff6b7d" },
    warning: { main: "#ffbd59" },
    success: { main: "#48d597" },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontWeight: 800, letterSpacing: "-0.04em" },
    h2: { fontWeight: 750, letterSpacing: "-0.03em" },
    h3: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            "radial-gradient(circle at 15% 0%, rgba(124,140,255,.13), transparent 32rem), radial-gradient(circle at 100% 18%, rgba(57,216,192,.08), transparent 28rem)",
          backgroundAttachment: "fixed",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${alpha("#aab5ff", 0.12)}`,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiIconButton: {
      styleOverrides: { root: { minHeight: 44, minWidth: 44 } },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiFormControl: { defaultProps: { size: "small" } },
  },
});
