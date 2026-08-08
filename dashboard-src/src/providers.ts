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
    const { data } = await supabaseClient.auth.getSession();
    return data.session ? { authenticated: true } : { authenticated: false, redirectTo: "/" };
  },
  getPermissions: async () => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const id = sessionData.session?.user.id;
    if (!id) return null;
    const { data } = await supabaseClient
      .from("dashboard_profiles")
      .select("role,active")
      .eq("id", id)
      .maybeSingle();
    return data?.active ? data.role : null;
  },
  getIdentity: async () => {
    const { data } = await supabaseClient.auth.getUser();
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
    const role = await authProvider.getPermissions?.();
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
