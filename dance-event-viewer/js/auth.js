/* Optional admin sign-in with Google (Supabase Auth). Nobody needs to sign in to view,
   submit an event or use "Wrong info?"; those posts go to the admin review list.
   ADMIN_EMAILS here is COSMETIC (shows admin controls). Real trust is enforced server-side
   by Supabase RLS (public.is_submissions_admin(), see supabase/migrations/) — never by a
   typed name. redirectTo is built from window.location.origin, so the same code works on
   https://danceeventviewer.net, http://localhost:<port> and http://127.0.0.1:<port>,
   provided each origin is on the Supabase Redirect URL allow-list (see SETUP.md). */
(function () {
  const config = window.DANCE_EVENT_VIEWER_SUPABASE;
  if (!window.supabase?.createClient || !config?.enabled) return;
  const admins = (window.ADMIN_EMAILS || config.adminEmails || []).map((e) => String(e).toLowerCase());
  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
  });
  const isAdmin = (session) => !!session?.user?.email && admins.includes(session.user.email.toLowerCase());

  // Back to the same page on the same origin (production, localhost or 127.0.0.1).
  function redirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  function signIn() {
    return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl() } });
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
        btn.textContent = "Admin sign-in";
        btn.title = "Optional — only for site admins. Anyone can submit without signing in.";
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

  window.DEV_AUTH = { client, signIn, isAdmin, admins, redirectUrl };
  const start = () => {
    render(null);
    client.auth.getSession().then(({ data }) => render(data.session));
    client.auth.onAuthStateChange((_e, session) => {
      render(session);
      window.dispatchEvent(new CustomEvent("dev-auth-change", { detail: { session, admin: isAdmin(session) } }));
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
