/* Google sign-in (Supabase Auth). Anyone may sign in; only ADMIN_EMAILS see edit controls.
   This gate is COSMETIC: real write permission is enforced server-side by Supabase RLS.
   Anonymous visitors keep full access to viewing, submitting events and "Wrong info?". */
(function () {
  const config = window.DANCE_EVENT_VIEWER_SUPABASE;
  if (!window.supabase?.createClient || !config?.enabled) return;
  const admins = (window.ADMIN_EMAILS || config.adminEmails || []).map((e) => String(e).toLowerCase());
  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
  });
  const isAdmin = (session) => !!session?.user?.email && admins.includes(session.user.email.toLowerCase());

  function signIn() {
    const redirectTo = window.location.href.split("#")[0];
    return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  }

  function render(session) {
    const admin = isAdmin(session);
    document.documentElement.classList.toggle("is-signed-in", !!session);
    document.documentElement.classList.toggle("is-admin", admin);
    document.querySelectorAll("[data-admin-only]").forEach((el) => { el.hidden = !admin; });
    document.querySelectorAll("[data-auth-slot]").forEach((slot) => {
      slot.textContent = "";
      if (!session) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "auth-btn";
        btn.dataset.authSignin = "";
        btn.textContent = "Sign in with Google";
        btn.addEventListener("click", () => { void signIn(); });
        slot.append(btn);
        return;
      }
      const chip = document.createElement("span");
      chip.className = "auth-chip";
      chip.dataset.authChip = "";
      const email = document.createElement("span");
      email.className = "auth-email";
      email.textContent = session.user.email || "Signed in";
      chip.append(email);
      if (admin) {
        const badge = document.createElement("span");
        badge.className = "auth-badge";
        badge.dataset.authAdminBadge = "";
        badge.textContent = "Admin";
        chip.append(badge);
      }
      const out = document.createElement("button");
      out.type = "button";
      out.className = "auth-signout";
      out.textContent = "Sign out";
      out.addEventListener("click", () => { void client.auth.signOut(); });
      chip.append(out);
      slot.append(chip);
    });
  }

  window.DEV_AUTH = { client, signIn, isAdmin, admins };
  const start = () => {
    render(null);
    client.auth.getSession().then(({ data }) => render(data.session));
    client.auth.onAuthStateChange((_e, session) => render(session));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
