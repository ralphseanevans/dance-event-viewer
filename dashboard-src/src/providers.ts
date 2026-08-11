import type { AccessControlProvider, AuthProvider } from "@refinedev/core";
import { supabaseClient, authRedirectUrl } from "./supabase";

export const authProvider: AuthProvider = {
  login: async ({ email, provider }) => {
    if (provider === "google") {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl },
      });
      return error ? { success: false, error } : { success: true };
    }
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirectUrl, shouldCreateUser: true },
    });
    return error ? { success: false, error } : { success: true };
  },
  logout: async () => {
    const { error } = await supabaseClient.auth.signOut();
    return error ? { success: false, error } : { success: true, redirectTo: "/" };
  },
  check: async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return { authenticated: false, error, redirectTo: "/" };
    return data.session ? { authenticated: true } : { authenticated: false, redirectTo: "/" };
  },
  // Throws instead of returning null on failure: a null role means "no access", and a
  // transient session or profile-read failure must not be reported as a denied account.
  getPermissions: async () => {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const id = sessionData.session?.user.id;
    if (!id) return null;
    const { data, error } = await supabaseClient
      .from("dashboard_profiles")
      .select("role,active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data?.active ? data.role : null;
  },
  getIdentity: async () => {
    const { data, error } = await supabaseClient.auth.getUser();
    // A missing session is the ordinary signed-out case; anything else is a real failure.
    if (error) {
      if (error.name === "AuthSessionMissingError") return null;
      throw error;
    }
    return data.user
      ? { id: data.user.id, name: data.user.email ?? "Dashboard user", email: data.user.email }
      : null;
  },
  onError: async (error) => {
    const status = Number((error as { status?: number }).status ?? 0);
    return status === 401 ? { logout: true } : {};
  },
};

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    let role: unknown;
    try {
      role = await authProvider.getPermissions?.();
    } catch (permissionError) {
      const message = permissionError instanceof Error ? permissionError.message : "unknown error";
      return { can: false, reason: `Permissions could not be checked (${message}). Reload once the connection recovers.` };
    }
    if (!role) return { can: false, reason: "Account is awaiting activation." };
    const adminOnly = ["people", "assignments", "crawlers"];
    if (adminOnly.includes(resource ?? "") && role !== "owner_admin") {
      return { can: false, reason: "Owner administrator access is required." };
    }
    if (["create", "delete"].includes(action) && role !== "owner_admin") {
      return { can: false, reason: "Volunteers cannot create or delete canonical records." };
    }
    return { can: true };
  },
};
