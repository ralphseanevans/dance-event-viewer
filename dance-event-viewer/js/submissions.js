/* Submissions review list (Supabase, 2026-10-22).
 * Every Submit-an-Event post and every "Wrong info?" report first files a row in
 * public.submissions through the public.submit_submission() RPC. Supabase decides
 * (supabase/migrations/*_submissions_rls.sql):
 *   - anyone, signed in or not: the row is "pending" and lands in the admin review list;
 *   - an allowlisted admin (by auth user id) only: the row may be "approved".
 * The browser only ASKS for "approved" when the signed-in email is on the cosmetic
 * admin list; if Supabase refuses, it falls back to "pending". The typed contact name is
 * never used for anything here.
 *
 * The server creates the row id and returns it. Each submission gets one client_key,
 * reused for every retry of the same content, so retries return the same row instead of
 * leaving orphans or duplicates. The row also stores payload_hash, a SHA-256 of the
 * canonical Apps Script payload, so the intake can check the content it receives is the
 * content the admin filed, and trust it only once (it marks the row consumed).
 *
 * The Supabase step is capped at TIMEOUT_MS: if Supabase hangs, the caller carries on
 * to the Apps Script intake exactly as if this step had failed.
 */
(function () {
  "use strict";

  const TABLE = "submissions";
  const RPC = "submit_submission";
  const TIMEOUT_MS = 4000;
  const DETAIL_FIELDS = ["name", "style", "style_other", "type", "day_of_week", "monthly_rule",
    "start_date", "end_date", "start_time", "end_time", "venue", "organizer", "cost",
    "source_note", "source_url"];
  const DETAIL_MAX = { source_note: 1000, source_url: 500 }; // others: 200 characters
  const DETAIL_BYTES = 5500; // the table caps details at 6144 bytes
  // Keys the Apps Script ignores for trust; must match PAYLOAD_HASH_SKIP_ in the .gs.
  const HASH_SKIP = ["action", "password", "token", "supabase_submission_id", "supabase_access_token"];
  const clientKeys = new Map(); // payload hash -> client_key, for retries in this page

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function clip(v, n) { return typeof v === "string" ? v.slice(0, n) : ""; }
  const utf8Bytes = (s) => (typeof TextEncoder === "function" ? new TextEncoder().encode(s).length : s.length * 3);

  /* Build the row from an Apps Script-style payload. Images never go to Supabase.
     The server sets id, status stamps and everything else. */
  function buildRow(payload) {
    const details = {};
    DETAIL_FIELDS.forEach((k) => { if (payload[k]) details[k] = clip(String(payload[k]), DETAIL_MAX[k] || 200); });
    // Multi-byte text can still exceed the byte cap: halve the longest field until it fits.
    while (utf8Bytes(JSON.stringify(details)) > DETAIL_BYTES) {
      const k = Object.keys(details).sort((a, b) => details[b].length - details[a].length)[0];
      details[k] = details[k].slice(0, Math.floor(details[k].length / 2));
    }
    const flyers = (payload.flyer_base64 ? 1 : 0) + (Array.isArray(payload.flyers_extra) ? payload.flyers_extra.length : 0);
    return {
      submission_kind: payload.submission_kind === "correction" ? "correction" : "new_event",
      intake_method: clip(payload.intake_method || "", 40),
      event_key: clip(payload.event_key || "", 200) || null,
      details,
      contact_name: clip(payload.contact_name || "", 100) || null,
      contact_email: clip(payload.contact_email || "", 200) || null,
      contact_phone: clip(payload.contact_phone || "", 60) || null,
      flyer_count: Math.min(5, flyers),
    };
  }

  /* Canonical JSON (sorted keys, undefined dropped like JSON.stringify) of what the
     Apps Script receives. Identical algorithm to canonicalJson_() in the .gs. */
  function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : canonical(x))).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== "function").sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function canonicalPayload(payload) {
    const o = {};
    Object.keys(payload).forEach((k) => { if (HASH_SKIP.indexOf(k) === -1) o[k] = payload[k]; });
    return canonical(o);
  }
  async function payloadHash(payload) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle || typeof TextEncoder !== "function") return null;
    const buf = await subtle.digest("SHA-256", new TextEncoder().encode(canonicalPayload(payload)));
    return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
  }

  async function recordUncapped(payload) {
    const auth = window.DEV_AUTH;
    if (!auth || !auth.client) return null;
    let session = null;
    try { session = (await auth.client.auth.getSession()).data.session; } catch (e) { session = null; }
    let hash = null;
    try { hash = await payloadHash(payload); } catch (e) { hash = null; }
    let clientKey = hash ? clientKeys.get(hash) : null;
    if (!clientKey) { clientKey = newId(); if (hash) clientKeys.set(hash, clientKey); }
    const wantApproved = !!(session && auth.isAdmin(session) && hash);
    const attempts = wantApproved ? ["approved", "pending"] : ["pending"];
    const row = buildRow(payload);
    for (const status of attempts) {
      try {
        const { data, error } = await auth.client.rpc(RPC, {
          p_client_key: clientKey, p_status: status, p_payload_hash: hash, p_row: row,
        });
        if (!error && data && typeof data.id === "string") {
          const approved = data.status === "approved";
          return { id: data.id, status: data.status, clientKey, payloadHash: hash,
            accessToken: approved && session ? session.access_token : null };
        }
      } catch (e) { /* try the next status, then give up quietly */ }
    }
    return null;
  }

  /* Returns { id, status, clientKey, payloadHash, accessToken } or null when Supabase
   * isn't available, refuses, or takes longer than TIMEOUT_MS. accessToken is set only
   * for an "approved" row (admin), never for pending ones. */
  async function record(payload) {
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); });
    try {
      return await Promise.race([recordUncapped(payload).catch(() => null), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /* Attach the Supabase reference to an Apps Script payload (mutates and returns it). */
  async function attach(payload) {
    const rec = await record(payload);
    if (rec) {
      payload.supabase_submission_id = rec.id;
      if (rec.accessToken) payload.supabase_access_token = rec.accessToken;
    }
    return rec;
  }

  window.DEV_SUBMISSIONS = { record, attach, buildRow, canonicalPayload, payloadHash, TABLE, RPC, TIMEOUT_MS };
})();
