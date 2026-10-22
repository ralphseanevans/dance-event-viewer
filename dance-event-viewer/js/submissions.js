/* Submissions review list (Supabase, 2026-10-22).
 * Every Submit-an-Event post and every "Wrong info?" report first files a row in
 * public.submissions. Supabase RLS (supabase/migrations/*_submissions_rls.sql) decides:
 *   - anyone, signed in or not: the row is "pending" and lands in the admin review list;
 *   - the admin Google account only: the row may be "approved" (goes live right away).
 * The browser only ASKS for "approved" when the signed-in email is on the cosmetic
 * admin list; if RLS refuses, it falls back to "pending". The typed contact name is
 * never used for anything here.
 *
 * The caller then sends the same submission to the Apps Script intake with
 * supabase_submission_id (and, only for an approved row, the admin's access token),
 * so the intake can read the row back under RLS before publishing anything.
 */
(function () {
  "use strict";

  const TABLE = "submissions";
  const DETAIL_FIELDS = ["name", "style", "style_other", "type", "day_of_week", "monthly_rule",
    "start_date", "end_date", "start_time", "end_time", "venue", "organizer", "cost",
    "source_note", "source_url"];

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function clip(v, n) { return typeof v === "string" ? v.slice(0, n) : ""; }

  /* Build the row from an Apps Script-style payload. Images never go to Supabase. */
  function buildRow(payload, id, status) {
    const details = {};
    DETAIL_FIELDS.forEach((k) => { if (payload[k]) details[k] = clip(String(payload[k]), 500); });
    const flyers = (payload.flyer_base64 ? 1 : 0) + (Array.isArray(payload.flyers_extra) ? payload.flyers_extra.length : 0);
    return {
      id,
      status,
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

  /* Returns { id, status, accessToken } or null when Supabase isn't available.
   * accessToken is set only for an "approved" row (admin), never for pending ones. */
  async function record(payload) {
    const auth = window.DEV_AUTH;
    if (!auth || !auth.client) return null;
    let session = null;
    try { session = (await auth.client.auth.getSession()).data.session; } catch (e) { session = null; }
    const wantApproved = !!(session && auth.isAdmin(session));
    const attempts = wantApproved ? ["approved", "pending"] : ["pending"];
    for (const status of attempts) {
      const id = newId();
      try {
        const { error } = await auth.client.from(TABLE).insert(buildRow(payload, id, status));
        if (!error) return { id, status, accessToken: status === "approved" ? session.access_token : null };
      } catch (e) { /* try the next status, then give up quietly */ }
    }
    return null;
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

  window.DEV_SUBMISSIONS = { record, attach, buildRow, TABLE };
})();
