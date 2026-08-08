import React from "react";
import ReactDOM from "react-dom/client";
import { Refine } from "@refinedev/core";
import { dataProvider } from "@refinedev/supabase";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { supabaseClient } from "./supabase";
import { accessControlProvider, authProvider } from "./providers";
import { dashboardTheme } from "./theme";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={dashboardTheme}>
      <CssBaseline />
      <Refine
        dataProvider={dataProvider(supabaseClient)}
        authProvider={authProvider}
        accessControlProvider={accessControlProvider}
        options={{ syncWithLocation: false, warnWhenUnsavedChanges: true, disableTelemetry: true }}
      >
        <App />
      </Refine>
    </ThemeProvider>
  </React.StrictMode>,
);
