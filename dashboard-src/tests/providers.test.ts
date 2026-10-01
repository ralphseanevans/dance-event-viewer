import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
};

const profileResult = { data: null as { role: string; active: boolean } | null };

const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => profileResult }) }),
}));

vi.mock("../src/supabase", () => ({
  supabaseClient: { auth, from },
  authRedirectUrl: "https://example.test/dashboard/",
}));

const { authProvider, accessControlProvider } = await import("../src/providers");

function session(userId: string | null) {
  return { data: { session: userId ? { user: { id: userId } } : null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  profileResult.data = null;
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue(session("user-1"));
  auth.getUser.mockResolvedValue({ data: { user: null } });
});

describe("authProvider.login", () => {
  it("starts a Google OAuth redirect back to the dashboard", async () => {
    await expect(authProvider.login({ provider: "google" })).resolves.toEqual({ success: true });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://example.test/dashboard/" },
    });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends an email link for anything else", async () => {
    await expect(authProvider.login({ email: "dancer@example.com" })).resolves.toEqual({ success: true });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "dancer@example.com",
      options: { emailRedirectTo: "https://example.test/dashboard/", shouldCreateUser: true },
    });
  });

  it("surfaces provider errors instead of reporting success", async () => {
    const error = new Error("otp failed");
    auth.signInWithOtp.mockResolvedValue({ error });
    await expect(authProvider.login({ email: "dancer@example.com" })).resolves.toEqual({ success: false, error });

    auth.signInWithOAuth.mockResolvedValue({ error });
    await expect(authProvider.login({ provider: "google" })).resolves.toEqual({ success: false, error });
  });
});

describe("authProvider.logout", () => {
  it("redirects to the login screen on success", async () => {
    await expect(authProvider.logout({})).resolves.toEqual({ success: true, redirectTo: "/" });
  });

  it("reports failure without redirecting", async () => {
    const error = new Error("network");
    auth.signOut.mockResolvedValue({ error });
    await expect(authProvider.logout({})).resolves.toEqual({ success: false, error });
  });
});

describe("authProvider.check", () => {
  it("authenticates when a session exists", async () => {
    await expect(authProvider.check()).resolves.toEqual({ authenticated: true });
  });

  it("sends signed-out visitors to the login screen", async () => {
    auth.getSession.mockResolvedValue(session(null));
    await expect(authProvider.check()).resolves.toEqual({ authenticated: false, redirectTo: "/" });
  });
});

describe("authProvider.getPermissions", () => {
  it("returns the role of an active profile", async () => {
    profileResult.data = { role: "volunteer", active: true };
    await expect(authProvider.getPermissions?.({})).resolves.toBe("volunteer");
    expect(from).toHaveBeenCalledWith("dashboard_profiles");
  });

  it("returns null for inactive profiles awaiting approval", async () => {
    profileResult.data = { role: "owner_admin", active: false };
    await expect(authProvider.getPermissions?.({})).resolves.toBeNull();
  });

  it("returns null without a session lookup when nobody is signed in", async () => {
    auth.getSession.mockResolvedValue(session(null));
    await expect(authProvider.getPermissions?.({})).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null when the profile row is missing", async () => {
    profileResult.data = null;
    await expect(authProvider.getPermissions?.({})).resolves.toBeNull();
  });
});

describe("authProvider.getIdentity", () => {
  it("falls back to a generic name when the account has no email", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: null } } });
    await expect(authProvider.getIdentity?.()).resolves.toEqual({
      id: "user-1",
      name: "Dashboard user",
      email: null,
    });
  });

  it("uses the email as the display name when present", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "dancer@example.com" } } });
    await expect(authProvider.getIdentity?.()).resolves.toEqual({
      id: "user-1",
      name: "dancer@example.com",
      email: "dancer@example.com",
    });
  });

  it("returns null when nobody is signed in", async () => {
    await expect(authProvider.getIdentity?.()).resolves.toBeNull();
  });
});

describe("authProvider.onError", () => {
  it("logs out on 401 and stays put otherwise", async () => {
    await expect(authProvider.onError({ status: 401 })).resolves.toEqual({ logout: true });
    await expect(authProvider.onError({ status: 500 })).resolves.toEqual({});
    await expect(authProvider.onError(new Error("boom"))).resolves.toEqual({});
  });
});

describe("accessControlProvider.can", () => {
  const can = (resource: string, action: string) =>
    accessControlProvider.can({ resource, action } as Parameters<typeof accessControlProvider.can>[0]);

  it("denies everything to accounts that are not active yet", async () => {
    await expect(can("events", "list")).resolves.toEqual({
      can: false,
      reason: "Account is awaiting activation.",
    });
  });

  it("keeps admin-only resources away from volunteers", async () => {
    profileResult.data = { role: "volunteer", active: true };
    for (const resource of ["people", "assignments", "crawlers"]) {
      await expect(can(resource, "list")).resolves.toEqual({
        can: false,
        reason: "Owner administrator access is required.",
      });
    }
  });

  it("treats a resource-less check as a plain permission check", async () => {
    profileResult.data = { role: "volunteer", active: true };
    await expect(
      accessControlProvider.can({ action: "list" } as Parameters<typeof accessControlProvider.can>[0]),
    ).resolves.toEqual({ can: true });
  });

  it("lets volunteers read and edit events but not create or delete them", async () => {
    profileResult.data = { role: "volunteer", active: true };
    await expect(can("events", "list")).resolves.toEqual({ can: true });
    await expect(can("events", "edit")).resolves.toEqual({ can: true });
    for (const action of ["create", "delete"]) {
      await expect(can("events", action)).resolves.toEqual({
        can: false,
        reason: "Volunteers cannot create or delete canonical records.",
      });
    }
  });

  it("blocks volunteer admins from admin-only resources too", async () => {
    profileResult.data = { role: "volunteer_admin", active: true };
    await expect(can("people", "list")).resolves.toEqual({
      can: false,
      reason: "Owner administrator access is required.",
    });
    await expect(can("events", "create")).resolves.toEqual({
      can: false,
      reason: "Volunteers cannot create or delete canonical records.",
    });
  });

  it("allows the owner admin everywhere", async () => {
    profileResult.data = { role: "owner_admin", active: true };
    await expect(can("people", "delete")).resolves.toEqual({ can: true });
    await expect(can("crawlers", "create")).resolves.toEqual({ can: true });
    await expect(can("events", "edit")).resolves.toEqual({ can: true });
  });
});
