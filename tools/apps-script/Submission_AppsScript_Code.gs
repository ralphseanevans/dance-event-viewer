/* Dance Event Viewer - Submission intake backend (Apps Script)
 * ============================================================
 * Public copy of the Apps Script project bound to the submissions Google Sheet.
 * Deployed as a Web App (Execute as Me / access Anyone) so the public submit
 * form can POST without signing in. Read/update paths require REVIEW_TOKEN or
 * DASHBOARD_PASSWORD, so the public deployment can't read submitter contact info.
 *
 * Nothing secret lives in this file. Everything sensitive is a Script Property
 * (Project Settings > Script Properties):
 *   NOTIFY_EMAIL         - where review / publish notifications are sent
 *   TRUSTED_NAME_PATTERN - case-insensitive regex; submissions whose contact name
 *                          matches it are auto-published. Keep it private. If unset,
 *                          nobody is trusted and everything goes to review.
 *   FLYERS_FOLDER_ID     - Drive folder that stores uploaded flyer photos
 *   GEMINI_API_KEY       - Google AI Studio key used to read flyer details
 *   OPENAI_API_KEY       - used by the "email me a designed graphic" feature
 *   REVIEW_TOKEN         - long random string for the private review tool
 *   DASHBOARD_PASSWORD   - password used by the review page
 *   GITHUB_TOKEN         - fine-grained PAT, Contents read/write on this repo only
 *
 * What it does:
 *   - Appends every submission (new event, correction, flyer upload) to the
 *     "Submissions" tab. It never writes dance_events.json or Supabase event data.
 *   - Trusted flyer uploads publish the image (logo-map.json + graphics/logos/) and,
 *     for complete new events, the web-events.json overlay. Everything else waits
 *     for review, with one-click Approve / Reject links in the notification email.
 *   - Text corrections are queued as "pending-fix" for a human to apply.
 * Edit the deployed copy in the Apps Script editor; keep this file in sync via PR.
 * ============================================================ */

const SHEET_NAME = "Submissions";
const GEMINI_MODEL = "gemini-flash-latest"; // vision-capable, free-tier eligible

const NOTIFY_EMAIL = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "";
const GITHUB_REPO = "ralphseanevans/dance-event-viewer";
const GITHUB_BRANCH = "main";
const LOGO_MAP_REPO_PATH = "dance-event-viewer/logo-map.json";
const SITE_SETTINGS_REPO_PATH = "site-settings.json";
const VALID_PAGE_CHARACTERS = ["panel-peeker", "hero-opossum", "blue-angels"];
const LOGOS_REPO_DIR = "graphics/logos"; // repo root, referenced as ../graphics/logos/ from index.html
// Trusted-uploader pattern comes from a Script Property so it is never public.
// Unset or invalid = trust nobody (everything goes to review).
const TRUSTED_NAME_RE = (() => {
  const pattern = PropertiesService.getScriptProperties().getProperty("TRUSTED_NAME_PATTERN");
  try { return pattern ? new RegExp(pattern, "i") : /(?!)/; } catch (e) { return /(?!)/; }
})();
const ALLOWED_IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

// Order matches the live Sheet as of 2026-07-13; NEW columns are appended at
// the end only (ensureHeaders_ migrates the sheet header row in place).
const HEADERS = [
  "timestamp", "row_id", "status", "intake_method", "submission_kind", "event_key",
  "source_note", "source_url",
  "flyer_url", "extraction_status",
  "name", "style", "style_other", "type", "day_of_week", "monthly_rule",
  "start_date", "end_date", "start_time", "end_time", "venue", "organizer", "cost",
  "contact_email", "contact_phone", "contact_name", "reviewed_at",
  "flyer_file_id", "flyer_token", "published_at", "logo_path",
  "extra_flyer_urls", // 2026-07-18: Drive links for photos 2..N of a multi-photo flyer upload
  "result_note", // 2026-07-23: human-readable outcome written back by the local queue processor
];

// 2026-07-23: every intake_method any frontend actually sends. Unknown non-empty
// values are rejected in handleSubmit_ (empty stays allowed for legacy senders).
const INTAKE_METHODS = ["flyer", "form", "link", "dashboard-removal-request", "dashboard-edit-request"];

/* ---------- Designed-graphic-by-email (poster) feature  ----------
   A viewer visitor picks several dances in "Share multiple", taps "Email me a
   designed graphic", and enters their email. Fully serverless in THIS project -
   uses the OpenAI image API (the owner has API credit there) + MailApp. The request is
   logged (so the owner can see how many people use it and who) and queued; a 1-minute
   time-driven trigger generates a seasonal poster and emails it. See the block at
   the very bottom of this file.
   REQUIRES a new Script Property: OPENAI_API_KEY (a funded OpenAI API key). */
const POSTER_IMAGE_MODEL = "gpt-image-1";  // OpenAI image model (POST /v1/images/generations)
const POSTER_IMAGE_SIZE = "1024x1536";     // portrait poster (1024x1024 | 1024x1536 | 1536x1024)
const POSTER_IMAGE_QUALITY = "medium";     // low | medium | high - medium balances text quality vs. the Apps Script fetch timeout
const POSTER_SHEET_NAME = "PosterRequests";
const POSTER_HEADERS = [
  "timestamp", "request_id", "email", "status", "event_count",
  "headline", "events_json", "requested_date", "month", "attempts",
  "sent_at", "error",
];
const POSTER_DAILY_CAP = 5;       // max graphics per email address per rolling 24h (abuse guard)
const POSTER_MAX_EVENTS = 8;      // events per graphic (keeps rendered text legible + accurate)
const POSTER_BATCH_PER_RUN = 3;   // queued requests processed per 1-minute trigger pass
const POSTER_MAX_ATTEMPTS = 3;    // give up + notify the owner after this many generation failures

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    ensureHeaders_(sheet);
  }
  return sheet;
}

/* In-place migration: append any HEADERS the sheet's row 1 doesn't have yet.
   New columns only ever land at the end; existing column order is untouched. */
function ensureHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = HEADERS.filter((h) => existing.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function htmlOut_(title, message) {
  const html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<style>body{font-family:system-ui,sans-serif;background:#0e1320;color:#e8edf7;display:grid;place-items:center;min-height:90vh;margin:0}" +
    ".card{background:#171f31;border:1px solid #2a3550;border-radius:12px;padding:28px 32px;max-width:480px;text-align:center}" +
    "h1{font-size:1.2rem;margin:0 0 10px}p{color:#9fadc4;line-height:1.5;margin:0}</style></head>" +
    "<body><div class='card'><h1>" + title + "</h1><p>" + message + "</p></div></body></html>";
  return HtmlService.createHtmlOutput(html);
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty("REVIEW_TOKEN");
  return !!expected && token === expected;
}

/* 2026-07-13 (dashboard): the hosted mobile queue dashboard (dance-dashboard.html,
   served from the public GitHub Pages site) must NOT embed the master REVIEW_TOKEN,
   or the token would sit in plaintext on a public URL. Instead it authenticates with
   a separate DASHBOARD_PASSWORD (Script Property) that the visitor types once and the
   page keeps in the browser's localStorage. The real REVIEW_TOKEN never leaves the
   server. Add a Script Property named DASHBOARD_PASSWORD (a strong passphrase) to
   enable it; if the property is unset, password auth is simply disabled and only the
   token path works (so the local Submission_Review.html is unaffected). */
function checkPassword_(pw) {
  const expected = PropertiesService.getScriptProperties().getProperty("DASHBOARD_PASSWORD");
  return !!expected && !!pw && pw === expected;
}

/* Authorized by EITHER the master REVIEW_TOKEN (local review tool) OR the
   DASHBOARD_PASSWORD (hosted mobile dashboard). Accepts a body/param object. */
function checkAuth_(o) {
  return checkToken_((o && o.token) || "") || checkPassword_((o && o.password) || "");
}

/* Durable, append-only execution records for every Apps Script request and
   poster-trigger attempt. This sheet intentionally stores safe diagnostics,
   not request bodies, contact details, credentials, or private payloads. */
const OPERATIONAL_LOG_SHEET_NAME = "OperationalLog";
const OPERATIONAL_LOG_HEADERS = [
  "timestamp", "timezone", "mechanic", "trigger_id", "run_id", "host",
  "phase", "skill", "tools", "operation", "status", "error_category",
  "error_message", "exit_code", "attempted_write", "persisted_write",
  "retry", "timeout", "verification", "impact", "next_action", "evidence",
];

function sanitizeOperationalText_(value) {
  return String(value == null ? "" : value)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL REDACTED]")
    .slice(0, 1200);
}

function getOperationalLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(OPERATIONAL_LOG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(OPERATIONAL_LOG_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(OPERATIONAL_LOG_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendOperationalEvent_(event) {
  try {
    const record = event || {};
    const error = record.error || {};
    const sheet = getOperationalLogSheet_();
    const row = {
      timestamp: new Date().toISOString(),
      timezone: Session.getScriptTimeZone(),
      mechanic: "Submission Apps Script",
      trigger_id: sanitizeOperationalText_(record.trigger_id),
      run_id: sanitizeOperationalText_(record.run_id || Utilities.getUuid()),
      host: "Google Apps Script",
      phase: sanitizeOperationalText_(record.phase),
      skill: sanitizeOperationalText_(record.skill || "Operations/Submission_AppsScript_Code.gs"),
      tools: sanitizeOperationalText_(Array.isArray(record.tools) ? record.tools.join(", ") : record.tools),
      operation: sanitizeOperationalText_(record.operation),
      status: sanitizeOperationalText_(record.status || "UNKNOWN"),
      error_category: sanitizeOperationalText_(error.category),
      error_message: sanitizeOperationalText_(error.message),
      exit_code: record.exit_code == null ? "" : record.exit_code,
      attempted_write: record.attempted_write == null ? "" : !!record.attempted_write,
      persisted_write: record.persisted_write == null ? "" : !!record.persisted_write,
      retry: record.retry == null ? "" : record.retry,
      timeout: record.timeout == null ? "" : record.timeout,
      verification: sanitizeOperationalText_(record.verification),
      impact: sanitizeOperationalText_(record.impact),
      next_action: sanitizeOperationalText_(record.next_action),
      evidence: sanitizeOperationalText_(record.evidence),
    };
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.appendRow(header.map(function (name) { return Object.prototype.hasOwnProperty.call(row, name) ? row[name] : ""; }));
  } catch (logErr) {
    // A logging failure must remain visible in the Apps Script execution log;
    // never replace or truncate earlier operational records while reporting it.
    console.error("OperationalLog append failed: " + sanitizeOperationalText_(logErr));
  }
}

/* ---------- doPost: public submissions + private review actions ---------- */
function doPost(e) {
  const runId = Utilities.getUuid();
  let action = "unknown";
  let status = "FAILED";
  try {
    const body = JSON.parse(e.postData.contents);
    action = body.action || "submit";

    if (action === "submit") { status = "COMPLETED"; return handleSubmit_(body); }
    if (action === "list") {
      // POST-based listing for the hosted dashboard (dance-dashboard.html) - same
      // simple-request pattern the public form already uses cross-origin, so no CORS
      // preflight surprises. doGet listing (for the local Submission_Review.html) stays.
      if (!checkAuth_(body)) return jsonOut_({ ok: false, error: "unauthorized" });
      status = "COMPLETED"; return handleList_(body.status, body.statuses, body.intake_method);
    }
    if (action === "update") {
      if (!checkAuth_(body)) return jsonOut_({ ok: false, error: "unauthorized" });
      status = "COMPLETED"; return handleUpdate_(body);
    }
    if (action === "delete") {
      if (!checkAuth_(body)) return jsonOut_({ ok: false, error: "unauthorized" });
      status = "COMPLETED"; return handleDelete_(body);
    }
    if (action === "site_appearance") {
      if (!checkAuth_(body)) return jsonOut_({ ok: false, error: "unauthorized" });
      status = "COMPLETED"; return handleSiteAppearance_(body);
    }
    // Public, rate-limited: viewer visitors request an AI-designed graphic by email.
    if (action === "poster_request") { status = "COMPLETED"; return handlePosterRequest_(body); }
    status = "FAILED";
    return jsonOut_({ ok: false, error: "unknown action" });
  } catch (err) {
    status = "FAILED";
    appendOperationalEvent_({ run_id: runId, phase: "request", operation: action + " dispatch", status: status,
      error: { category: "request-exception", message: err && err.message ? err.message : err },
      attempted_write: ["submit", "update", "delete", "site_appearance", "poster_request"].indexOf(action) !== -1,
      verification: "handler exception returned to caller", next_action: "inspect OperationalLog and retry after repair" });
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    appendOperationalEvent_({ run_id: runId, phase: "request", operation: action + " dispatch", status: status,
      attempted_write: ["submit", "update", "delete", "site_appearance", "poster_request"].indexOf(action) !== -1,
      verification: status === "COMPLETED" ? "handler returned a response" : "see error record", evidence: "OperationalLog" });
  }
}

function handleSubmit_(body) {
  const intakeMethod = String(body.intake_method || "").slice(0, 40);
  if (intakeMethod && INTAKE_METHODS.indexOf(intakeMethod) === -1) {
    return jsonOut_({ ok: false, error: "unknown intake_method" });
  }
  const sheet = getSheet_();
  const rowId = Utilities.getUuid();
  const row = {
    timestamp: new Date().toISOString(),
    row_id: rowId,
    status: "pending",
    intake_method: intakeMethod,
    // submission_kind (2026-07-13): "new_event" (default, from the Submit-an-Event form) or
    // "correction" (from the live calendar's "Wrong info?" widget attaching a flyer photo).
    // event_key is only meaningful for corrections - the existing dance_events.json key
    // this pertains to, so the owner can find the right listing without guessing from free text.
    submission_kind: String(body.submission_kind || "new_event").slice(0, 20),
    event_key: String(body.event_key || "").slice(0, 200),
    source_note: String(body.source_note || "").slice(0, 500),
    source_url: /^https?:\/\//i.test(body.source_url || "") ? body.source_url.trim().slice(0, 500) : "",
    flyer_url: "",
    extraction_status: "none",
    name: String(body.name || "").slice(0, 200),
    style: String(body.style || "").slice(0, 40),
    style_other: String(body.style_other || "").slice(0, 60),
    type: String(body.type || "").slice(0, 40),
    day_of_week: String(body.day_of_week || "").slice(0, 20),
    monthly_rule: String(body.monthly_rule || "").slice(0, 100),
    start_date: String(body.start_date || "").slice(0, 20),
    end_date: String(body.end_date || "").slice(0, 10),
    start_time: String(body.start_time || "").slice(0, 10),
    end_time: String(body.end_time || "").slice(0, 10),
    venue: String(body.venue || "").slice(0, 300),
    organizer: String(body.organizer || "").slice(0, 200),
    cost: String(body.cost || "").slice(0, 100),
    contact_email: String(body.contact_email || "").slice(0, 200),
    contact_phone: String(body.contact_phone || "").slice(0, 60),
    contact_name: String(body.contact_name || "").slice(0, 100),
    reviewed_at: "",
    flyer_file_id: "",
    flyer_token: "",
    published_at: "",
    logo_path: "",
    extra_flyer_urls: "",
  };
  const isCorrection = row.submission_kind === "correction" && !!row.event_key;

  // At least one contact method required - reject otherwise (belt-and-suspenders;
  // the form itself validates this client-side too). Corrections are exempt (2026-07-13):
  // the "Wrong info?" widget never required contact info before this change, and requiring
  // it now would be a regression for that flow.
  if (row.submission_kind !== "correction" &&
      !row.contact_email && !row.contact_phone && !row.contact_name) {
    return jsonOut_({ ok: false, error: "at least one contact method is required" });
  }

  let flyerBlob = null;       // FIRST photo - the one that publishes to the site
  let extraBlobs = [];        // photos 2..N of the same flyer (2026-07-18) - Drive + extraction only
  const isForm = row.intake_method === "form"; // Fill Out Details path (2026-07-18)
  if (body.flyer_base64) {
    try {
      const mime = body.flyer_mime || "image/jpeg";
      if ((isCorrection || isForm) && !ALLOWED_IMAGE_EXT[mime]) {
        return jsonOut_({ ok: false, error: "please upload a JPG, PNG, GIF, or WebP image" });
      }
      const bytes = Utilities.base64Decode(body.flyer_base64);
      const folderId = PropertiesService.getScriptProperties().getProperty("FLYERS_FOLDER_ID");
      const folder = DriveApp.getFolderById(folderId);
      const blob = Utilities.newBlob(bytes, mime, `flyer-${rowId}.${mime.split("/")[1] || "jpg"}`);
      const file = folder.createFile(blob);
      // 2026-08-06 hardening: sharing is a nicety (it only makes the Drive link in
      // the owner's email open without sign-in) - the GitHub publish path never needs it.
      // On 2026-08-05/06 an inherited folder permission made setSharing throw, which
      // killed flyerBlob and silently broke EVERY instant-publish path. Never again:
      // a sharing failure degrades to an owner-only Drive link and the pipeline runs on.
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (shareErr) { /* owner-only link is fine */ }
      row.flyer_url = file.getUrl();
      row.flyer_file_id = file.getId();
      flyerBlob = blob;

      // Additional photos of the SAME flyer (2026-07-18, "Upload a Flyer" path only).
      // Capped defensively; each goes to Drive and joins the extraction call below.
      const images = [{ bytes: bytes, mime: mime }];
      if (Array.isArray(body.flyers_extra)) {
        const extraUrls = [];
        for (let i = 0; i < body.flyers_extra.length && i < 4; i++) {
          try {
            const ex = body.flyers_extra[i] || {};
            const exMime = ex.mime || "image/jpeg";
            if (!ex.base64 || !ALLOWED_IMAGE_EXT[exMime]) continue;
            const exBytes = Utilities.base64Decode(ex.base64);
            const exBlob = Utilities.newBlob(exBytes, exMime, `flyer-${rowId}-p${i + 2}.${exMime.split("/")[1] || "jpg"}`);
            const exFile = folder.createFile(exBlob);
            try { exFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (shareErr) { /* owner-only link is fine */ }
            extraUrls.push(exFile.getUrl());
            extraBlobs.push(exBlob);
            images.push({ bytes: exBytes, mime: exMime });
          } catch (exErr) { /* skip a bad extra photo, keep the submission */ }
        }
        row.extra_flyer_urls = extraUrls.join("\n");
      }

      // Gemini field extraction: for NEW events arriving as flyer photos (all photos
      // go in one call - front/back/close-ups together read better than any single
      // shot) and, as of 2026-07-17, for TRUSTED flyer CORRECTIONS too. Untrusted
      // corrections still skip it. The FORM path also skips it (2026-07-18): the
      // submitter typed the details themselves - the human's data is authoritative,
      // and the image is only the event's card picture.
      if (!isForm && (!isCorrection || TRUSTED_NAME_RE.test(row.contact_name))) {
        const drafted = extractFlyerFields_(images);
        if (drafted) {
          row.extraction_status = "ai-drafted";
          const fields = ["name", "style", "type", "day_of_week", "monthly_rule",
            "start_date", "end_date", "start_time", "end_time", "venue", "cost"];
          for (const k of fields) {
            if (drafted[k] && !row[k]) row[k] = String(drafted[k]).slice(0, 300);
          }
        } else {
          row.extraction_status = "extraction-failed";
        }
      }
    } catch (imgErr) {
      // Never lose the submission just because the image/AI step failed.
      row.extraction_status = "extraction-failed";
      // 2026-08-06 hardening: this catch used to be SILENT, so when Drive broke on
      // 2026-08-03 every trusted upload quietly fell into the review pile and nobody
      // knew for days. Now the owner gets an immediate email naming the step and error.
      try {
        MailApp.sendEmail(NOTIFY_EMAIL,
          "Flyer intake image step FAILED: " + (row.name || row.event_key || "(no name)"),
          [
            "The image/AI step of a submission threw an error, so it fell back to the plain review queue",
            "instead of any instant-publish path. The submission itself was NOT lost.",
            "",
            "From: " + (row.contact_name || "(no name)"),
            "Kind: " + row.submission_kind + "  [key: " + (row.event_key || "-") + "]",
            "Row: " + rowId,
            "Error: " + String(imgErr).slice(0, 500),
            "",
            "If this keeps happening, check the uploaded-flyers folder's sharing/permissions",
            "and the FLYERS_FOLDER_ID / GEMINI_API_KEY script properties.",
          ].join("\n"));
      } catch (mailErr) { /* never let the alert kill the submission either */ }
    }
  }

  /* ----- One-step flyer pipeline (corrections with a photo only, 2026-07-13) ----- */
  if (isCorrection && flyerBlob) {
    const trusted = TRUSTED_NAME_RE.test(row.contact_name);
    if (trusted) {
      try {
        const result = publishFlyerToGitHub_(row.event_key, row.type, flyerBlob, rowId);
        row.published_at = new Date().toISOString();
        row.logo_path = result.logoPath;
        // 2026-07-17: also queue the flyer's DETAILS for the existing listing. The
        // fields were read off the image above (trusted corrections extract now); if
        // any usable field came back, mark the row "pending-fix" so those details get
        // applied to the listing through the interactive apply step. The image is live
        // either way; Apps Script itself never edits the calendar data. If the flyer
        // yielded nothing usable, the row is just "published" (image only), as before.
        const detailFields = ["name", "style", "day_of_week", "monthly_rule",
          "start_date", "end_date", "start_time", "end_time", "venue", "cost"];
        const detailsQueued = row.extraction_status === "ai-drafted" && detailFields.some((k) => row[k]);
        row.status = detailsQueued ? "pending-fix" : "published";
        appendRow_(sheet, row);
        notifyFlyer_(row, flyerBlob, {
          kind: detailsQueued ? "published-fix" : "published",
          detail: "Auto-published (trusted name: \"" + row.contact_name + "\"). Image live in ~1-2 minutes.\n" +
            "Image committed: " + result.imagePath + "\n" +
            (result.patternAdded ? "Recurring pattern added/refreshed: \"" + result.patternAdded + "\" (carries this flyer to sibling listings of the series).\n" : "") +
            (detailsQueued
              ? ("\nDetails read from the flyer (row queued as \"pending-fix\") - apply them to the listing in a session with \"apply the queued flyer fixes\"; nothing is written to the calendar data automatically:\n" +
                 detailFields.filter((k) => row[k]).map((k) => "  " + k + ": " + row[k]).join("\n") + "\n")
              : "") +
            "To revert the image: remove the logo-map.json entry for this key in the repo.",
        });
        return jsonOut_({ ok: true, row_id: rowId, published: true, queued_fix: detailsQueued });
      } catch (pubErr) {
        // Publish failed (e.g. GITHUB_TOKEN missing/expired) - fall through to
        // the held queue so nothing is lost, and tell the owner why.
        row.status = "pending-flyer";
        row.flyer_token = Utilities.getUuid();
        appendRow_(sheet, row);
        notifyFlyer_(row, flyerBlob, {
          kind: "publish-failed",
          detail: "AUTO-PUBLISH FAILED: " + String(pubErr) + "\n" +
            "(Most likely GITHUB_TOKEN is missing or the PAT expired - see Script Properties.)\n" +
            "Once fixed, use the Approve link below to publish this flyer.",
          links: true,
        });
        return jsonOut_({ ok: true, row_id: rowId, published: false });
      }
    }
    // Untrusted sender -> hold for one-click approval.
    row.status = "pending-flyer";
    row.flyer_token = Utilities.getUuid();
    appendRow_(sheet, row);
    notifyFlyer_(row, flyerBlob, { kind: "pending", links: true });
    return jsonOut_({ ok: true, row_id: rowId, published: false });
  }

  /* ----- Text-only corrections (no photo, 2026-07-13; fixer retired 2026-07-16) -----
     Trusted senders queue as "pending-fix"; everyone else lands in the normal review
     queue. The hourly on-machine dos-correction-fixer that used to apply these was
     retired in the factory reset, so "pending-fix" now just surfaces the row
     (dos-correction-watch notifies) for the owner to apply interactively. This script
     never edits event data itself. */
  if (isCorrection && !flyerBlob) {
    const trusted = TRUSTED_NAME_RE.test(row.contact_name);
    row.status = trusted ? "pending-fix" : "pending";
    appendRow_(sheet, row);
    notifyFlyer_(row, null, {
      kind: "correction",
      detail: trusted
        ? "Trusted sender - queued as \"pending-fix\". Apply it in a session with \"apply the queued flyer fixes\" (the old hourly auto-fixer was retired in the factory reset)."
        : "Not from a trusted name - review it in Submission_Review.html, or ask Claude to apply it.",
    });
    return jsonOut_({ ok: true, row_id: rowId, published: false, queued: trusted });
  }

  /* ----- Form-path flyer (2026-07-18, the owner's ask) -----
     "Fill Out Details" + an attached flyer image. The typed details are authoritative
     (no extraction). Trusted name -> event + flyer live immediately via the overlay,
     exactly like trusted flyer uploads. Anyone else -> held as "pending-flyer" with
     one-click Approve/Reject links; Approve publishes the event + flyer together
     (see handleFlyerReview_). A form submission with NO flyer is unchanged below. */
  if (row.submission_kind === "new_event" && isForm && flyerBlob) {
    const built = buildEventFromRow_(row);
    if (TRUSTED_NAME_RE.test(row.contact_name)) {
      if (built) {
        try {
          const result = publishNewEventToGitHub_(built.event, flyerBlob, rowId);
          row.status = "published-new";
          row.published_at = new Date().toISOString();
          row.event_key = built.key;
          row.logo_path = result.logoPath;
          appendRow_(sheet, row);
          notifyNewEvent_(row, flyerBlob, built.event, { kind: "published", result: result });
          return jsonOut_({ ok: true, row_id: rowId, published: true, key: built.key });
        } catch (pubErr) {
          row.status = "pending";
          appendRow_(sheet, row);
          notifyNewEvent_(row, flyerBlob, built.event, { kind: "publish-failed", detail: String(pubErr) });
          return jsonOut_({ ok: true, row_id: rowId, published: false });
        }
      }
      // Trusted but the typed details don't build a publishable event -> quick review.
      row.status = "pending";
      appendRow_(sheet, row);
      notifyNewEvent_(row, flyerBlob, null, { kind: "incomplete" });
      return jsonOut_({ ok: true, row_id: rowId, published: false });
    }
    // Untrusted submitter -> hold; Approve in the email publishes event + flyer.
    row.status = "pending-flyer";
    row.flyer_token = Utilities.getUuid();
    appendRow_(sheet, row);
    notifyNewEvent_(row, flyerBlob, built ? built.event : null, { kind: "pending", links: true, row: row });
    return jsonOut_({ ok: true, row_id: rowId, published: false });
  }

  /* ----- New-event auto-publish (trusted flyer uploads only, 2026-07-17) -----
     the owner's ask: an "Add event" flow where HE uploads a flyer and it goes live
     with no review. Gated strictly on the trusted name AND a confident
     extraction. Publishes to the web-events.json OVERLAY (never
     dance_events.json), so a later skill publish can't clobber it. Anything
     short of that falls through to the normal "pending" review queue below. */
  if (row.submission_kind === "new_event" && flyerBlob &&
      TRUSTED_NAME_RE.test(row.contact_name) && row.extraction_status === "ai-drafted") {
    const built = buildEventFromRow_(row);
    if (built) {
      try {
        const result = publishNewEventToGitHub_(built.event, flyerBlob, rowId);
        row.status = "published-new";
        row.published_at = new Date().toISOString();
        row.event_key = built.key;
        row.logo_path = result.logoPath;
        appendRow_(sheet, row);
        notifyNewEvent_(row, flyerBlob, built.event, { kind: "published", result: result });
        return jsonOut_({ ok: true, row_id: rowId, published: true, key: built.key });
      } catch (pubErr) {
        // Publish failed (e.g. GITHUB_TOKEN missing/expired) -> hold for review,
        // nothing lost, tell the owner why.
        row.status = "pending";
        appendRow_(sheet, row);
        notifyNewEvent_(row, flyerBlob, built.event, { kind: "publish-failed", detail: String(pubErr) });
        return jsonOut_({ ok: true, row_id: rowId, published: false });
      }
    }
    // Extraction too incomplete to publish unattended -> hold for a quick review.
    row.status = "pending";
    appendRow_(sheet, row);
    notifyNewEvent_(row, flyerBlob, null, { kind: "incomplete" });
    return jsonOut_({ ok: true, row_id: rowId, published: false });
  }

  appendRow_(sheet, row);
  return jsonOut_({ ok: true, row_id: rowId });
}

/* Email the owner about a flyer correction. opts.kind: published | pending | publish-failed | correction.
   opts.links: include one-click Approve/Reject links (uses the row's single-use token). */
function notifyFlyer_(row, blob, opts) {
  try {
    const subjectByKind = {
      "published": "Flyer published: ",
      "published-fix": "Flyer published + details queued: ",
      "pending": "Flyer awaiting approval: ",
      "publish-failed": "Flyer publish FAILED: ",
      "correction": "Listing correction: ",
    };
    const subject = (subjectByKind[opts.kind] || "Flyer: ") + (row.name || row.event_key);
    const lines = [
      "Event: " + (row.name || "(no name)") + "  [key: " + row.event_key + "]",
      "Event type: " + (row.type || "(unknown)"),
      "From: " + (row.contact_name || "(no name given)"),
      "Note: " + (row.source_note || "(none)"),
      "Link given: " + (row.source_url || "(none)"),
      "Flyer (Drive copy): " + (row.flyer_url || "(no photo)"),
      row.extra_flyer_urls ? "More photos of the same flyer:\n" + row.extra_flyer_urls : "",
      "",
    ];
    if (opts.detail) lines.push(opts.detail, "");
    if (opts.links) {
      const base = ScriptApp.getService().getUrl();
      lines.push(
        "APPROVE (publishes to the live site): ",
        base + "?action=flyer_review&row_id=" + row.row_id + "&decision=approve&t=" + row.flyer_token,
        "",
        "REJECT (discard): ",
        base + "?action=flyer_review&row_id=" + row.row_id + "&decision=reject&t=" + row.flyer_token
      );
    }
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: subject,
      body: lines.join("\n"),
      attachments: blob ? [blob] : [],
    });
  } catch (mailErr) {
    // Never fail the submission over a notification problem.
  }
}

/* ---------- GitHub publish: commit image + update logo-map.json ---------- */

function githubRequest_(method, path, payload) {
  const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKEN script property is not set");
  const res = UrlFetchApp.fetch("https://api.github.com/repos/" + GITHUB_REPO + "/" + path, {
    method: method,
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("GitHub " + method + " " + path + " -> HTTP " + code + ": " + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

/* Authenticated dashboard setting: commit the selected page-character combination
   to the small public settings file. The viewer reads this file without exposing the
   dashboard password or GitHub token. */
function handleSiteAppearance_(body) {
  const requested = Array.isArray(body.page_characters) ? body.page_characters : [];
  const selected = VALID_PAGE_CHARACTERS.filter((value) => requested.indexOf(value) !== -1);
  const current = githubRequest_("get", "contents/" + SITE_SETTINGS_REPO_PATH + "?ref=" + GITHUB_BRANCH);
  const currentText = Utilities.newBlob(
    Utilities.base64Decode(String(current.content || "").replace(/\s/g, ""))
  ).getDataAsString("UTF-8");
  let settings = {};
  try { settings = JSON.parse(currentText); } catch (err) { settings = {}; }
  const previous = Array.isArray(settings.page_characters) ? settings.page_characters : [];
  if (JSON.stringify(previous) === JSON.stringify(selected)) {
    return jsonOut_({ ok: true, changed: false, page_characters: selected });
  }
  settings.page_characters = selected;
  githubRequest_("put", "contents/" + SITE_SETTINGS_REPO_PATH, {
    message: "Update page character selection",
    content: Utilities.base64Encode(JSON.stringify(settings, null, 2) + "\n", Utilities.Charset.UTF_8),
    sha: current.sha,
    branch: GITHUB_BRANCH,
  });
  return jsonOut_({ ok: true, changed: true, page_characters: selected });
}

/* Commits the flyer image to graphics/logos/ and points logo-map.json's
   "logos" entry for eventKey at it. Recurring events also get a "patterns"
   entry (prepended, so it wins) so the flyer follows the series across
   rolled-over keys. Returns { imagePath, logoPath, patternAdded }. */
function publishFlyerToGitHub_(eventKey, eventType, blob, rowId) {
  const mime = blob.getContentType();
  const ext = ALLOWED_IMAGE_EXT[mime];
  if (!ext) throw new Error("unsupported image type: " + mime);

  const safeKey = String(eventKey).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!safeKey) throw new Error("bad event key");
  const imageName = "upload-" + safeKey + "-" + String(rowId).slice(0, 8) + "." + ext;
  const imagePath = LOGOS_REPO_DIR + "/" + imageName;

  // 1) Commit the image.
  githubRequest_("put", "contents/" + imagePath, {
    message: "Flyer upload for " + eventKey + " (via Wrong info? widget)",
    content: Utilities.base64Encode(blob.getBytes()),
    branch: GITHUB_BRANCH,
  });

  // 2) Update logo-map.json (read-modify-write with sha).
  const current = githubRequest_("get", "contents/" + LOGO_MAP_REPO_PATH + "?ref=" + GITHUB_BRANCH);
  // GitHub returns base64 with embedded newlines; strip all whitespace first.
  const mapText = Utilities.newBlob(Utilities.base64Decode(String(current.content).replace(/\s/g, ""))).getDataAsString("UTF-8");
  const map = JSON.parse(mapText);
  if (!map.logos || typeof map.logos !== "object") map.logos = {};
  if (!Array.isArray(map.patterns)) map.patterns = [];

  const logoPath = "../" + LOGOS_REPO_DIR + "/" + imageName;
  map.logos[eventKey] = logoPath;

  let patternAdded = null;
  if (/recurring/.test(String(eventType))) {
    const contains = deriveSeriesContains_(eventKey);
    if (contains) {
      map.patterns = map.patterns.filter((p) => !p || p.contains !== contains);
      map.patterns.unshift({ contains: contains, logo: logoPath }); // first match wins
      patternAdded = contains;
    }
  }

  githubRequest_("put", "contents/" + LOGO_MAP_REPO_PATH, {
    message: "logo-map: " + eventKey + " -> " + imageName + (patternAdded ? " (+ series pattern \"" + patternAdded + "\")" : ""),
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(map, null, 2) + "\n", "application/json").getBytes()),
    sha: current.sha,
    branch: GITHUB_BRANCH,
  });

  return { imagePath: imagePath, logoPath: logoPath, patternAdded: patternAdded };
}

/* Strips date-ish suffixes off an event key to get the stable series stem,
   e.g. west-coast-wednesdays-in-july-2026 -> west-coast-wednesdays,
   good-ole-social-dance-2026-07-17 -> good-ole-social-dance.
   Returns null if nothing usable remains. */
function deriveSeriesContains_(key) {
  const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
  const SEASONS = "spring|summer|fall|autumn|winter";
  let s = String(key).toLowerCase();
  let prev;
  do {
    prev = s;
    s = s.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    s = s.replace(new RegExp("-(in-)?(" + MONTHS + ")-\\d{4}$"), "");
    s = s.replace(new RegExp("-(" + SEASONS + ")-\\d{4}$"), "");
    s = s.replace(/-\d{4}-\d{2}$/, "");
    s = s.replace(/-\d{4}$/, "");
  } while (s !== prev);
  if (s.length >= 6) return s;
  return String(key).length >= 6 ? String(key) : null;
}

/* ---------- New-event auto-publish helpers (2026-07-17) ---------- */

/* US state names/abbreviations, for deriving the 2-letter `state` field the
   viewer's regional gate needs (an event with no recognizable state defaults to
   non-regional and would hide behind the "Traveling" toggle). Best-effort text
   scan of the venue string; null when nothing matches. */
const US_STATES_ = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA","colorado":"CO",
  "connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA","hawaii":"HI","idaho":"ID",
  "illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS","kentucky":"KY","louisiana":"LA",
  "maine":"ME","maryland":"MD","massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS",
  "missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND","ohio":"OH","oklahoma":"OK",
  "oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD",
  "tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT","virginia":"VA","washington":"WA",
  "west virginia":"WV","wisconsin":"WI","wyoming":"WY","district of columbia":"DC"
};
const US_ABBR_ = (function () { const s = {}; for (const k in US_STATES_) s[US_STATES_[k]] = US_STATES_[k]; return s; })();

function deriveState_(venue) {
  const v = String(venue || "");
  // 1) trailing/standalone 2-letter code, e.g. "..., Pensacola, FL 32503" or "Mobile, AL".
  const m = v.match(/\b([A-Za-z]{2})\b(?:\s+\d{5})?\s*$/);
  if (m && US_ABBR_[m[1].toUpperCase()]) return m[1].toUpperCase();
  const anyAbbr = v.match(/,\s*([A-Za-z]{2})\b/g);
  if (anyAbbr && anyAbbr.length) {
    const last = anyAbbr[anyAbbr.length - 1].replace(/[,\s]/g, "").toUpperCase();
    if (US_ABBR_[last]) return last;
  }
  // 2) a full state name anywhere in the string.
  const low = v.toLowerCase();
  for (const name in US_STATES_) if (low.indexOf(name) !== -1) return US_STATES_[name];
  return null;
}

/* Slugify a name + schedule into a stable, URL-safe event key, matching the
   dash-separated lowercase convention used across dance_events.json. */
function makeEventKey_(name, type, startDate, dow, rule) {
  const base = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event";
  let suffix = "";
  if (type === "one_time" && startDate) suffix = "-" + startDate;
  else if ((type === "weekly_recurring" || type === "biweekly_recurring") && dow) suffix = "-" + String(dow).toLowerCase();
  else if (type === "monthly_recurring" && rule) suffix = "-" + String(rule).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (base + suffix).replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

/* Build a public-schema event from a drafted submission row, or return null if
   the extraction is too incomplete to publish unattended. Emits exactly the 14
   published fields (see Tools/lib.mjs PUBLIC_FIELDS) so an overlay event is
   indistinguishable from a native one in the viewer. */
function buildEventFromRow_(row) {
  const name = String(row.name || "").trim();
  const type = String(row.type || "").trim();
  const TYPES = ["weekly_recurring", "biweekly_recurring", "monthly_recurring", "one_time"];
  if (!name || TYPES.indexOf(type) === -1) return null;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const timeRe = /^\d{2}:\d{2}$/;
  const dow = String(row.day_of_week || "").trim();
  const rule = String(row.monthly_rule || "").trim();
  const startDate = dateRe.test(String(row.start_date || "").trim()) ? String(row.start_date).trim() : "";

  // Schedule-completeness gate — never publish a half-blank event.
  if (type === "one_time" && !startDate) return null;
  if (type === "weekly_recurring" && !dow) return null;
  if (type === "biweekly_recurring" && (!dow || !startDate)) return null;
  if (type === "monthly_recurring" && !rule) return null;

  const venue = String(row.venue || "").trim();
  if (!venue) return null; // a listing with no location isn't usable

  // Style: keep the viewer's known values; fall back to style_other, else "Mixed".
  const KNOWN = ["West Coast Swing", "Latin", "Mixed", "Argentine Tango"];
  let style = String(row.style || "").trim();
  if (style === "Other" || KNOWN.indexOf(style) === -1) {
    style = String(row.style_other || "").trim() || (KNOWN.indexOf(style) === -1 ? "Mixed" : style);
  }

  const endDate = dateRe.test(String(row.end_date || "").trim()) ? String(row.end_date).trim() : null;
  const key = makeEventKey_(name, type, startDate, dow, rule);
  const event = {
    key: key,
    name: name.slice(0, 200),
    style: style.slice(0, 40),
    type: type,
    day_of_week: (type === "weekly_recurring" || type === "biweekly_recurring") ? dow.slice(0, 20) : "",
    monthly_rule: type === "monthly_recurring" ? rule.slice(0, 100) : "",
    start_date: startDate || null,
    end_date: endDate,
    start_time: timeRe.test(String(row.start_time || "").trim()) ? String(row.start_time).trim() : "",
    end_time: timeRe.test(String(row.end_time || "").trim()) ? String(row.end_time).trim() : "",
    venue: venue.slice(0, 300),
    state: deriveState_(venue),
    cost: String(row.cost || "").trim().slice(0, 100),
    source_url: /^https?:\/\//i.test(row.source_url || "") ? String(row.source_url).trim().slice(0, 500) : "",
  };
  return { event: event, key: key };
}

/* Publish a new event live: reuse the proven flyer publisher for the image +
   logo-map layer, then append the event to the web-events.json overlay (create
   it if absent). Read-modify-write with sha, same as logo-map.json. Replaces any
   existing overlay entry with the same key (idempotent re-uploads). */
const WEB_EVENTS_REPO_PATH = "web-events.json"; // repo root; served to the viewer as ../web-events.json

function publishNewEventToGitHub_(event, blob, rowId) {
  // 1) Image + logo-map.json (exact same path the flyer-correction pipeline uses).
  const logo = publishFlyerToGitHub_(event.key, event.type, blob, rowId);

  // 2) Overlay event file — separate from the skills' dance_events.json.
  let current = null;
  let overlay = { events: [] };
  try {
    current = githubRequest_("get", "contents/" + WEB_EVENTS_REPO_PATH + "?ref=" + GITHUB_BRANCH);
    const txt = Utilities.newBlob(Utilities.base64Decode(String(current.content).replace(/\s/g, ""))).getDataAsString("UTF-8");
    const parsed = JSON.parse(txt);
    if (parsed && Array.isArray(parsed.events)) overlay = parsed;
  } catch (getErr) {
    current = null; // 404 -> file doesn't exist yet; we'll create it
    overlay = { events: [] };
  }
  overlay.events = overlay.events.filter((e) => e && e.key !== event.key); // replace same-key
  overlay.events.push(event);

  const payload = {
    message: "web-events: add \"" + event.key + "\" (trusted flyer auto-publish)",
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(overlay, null, 2) + "\n", "application/json").getBytes()),
    branch: GITHUB_BRANCH,
  };
  if (current && current.sha) payload.sha = current.sha;
  githubRequest_("put", "contents/" + WEB_EVENTS_REPO_PATH, payload);

  return { logoPath: logo.logoPath, imagePath: logo.imagePath, patternAdded: logo.patternAdded, overlayCount: overlay.events.length };
}

/* Email the owner about a new-event submission with a flyer.
   opts.kind: published | publish-failed | incomplete | pending.
   "pending" (2026-07-18, untrusted form-path flyer) includes one-click
   Approve/Reject links - Approve publishes the EVENT + flyer together. */
function notifyNewEvent_(row, blob, event, opts) {
  try {
    const subjectByKind = {
      "published": "New event published: ",
      "publish-failed": "New event publish FAILED: ",
      "incomplete": "New event needs review (couldn't auto-read flyer): ",
      "pending": "New event + flyer awaiting approval: ",
    };
    const title = (event && event.name) || row.name || "(no name)";
    const lines = [
      "New-event flyer upload from \"" + (row.contact_name || "(no name)") + "\".",
      "",
    ];
    if (opts.kind === "published" && event) {
      lines.push(
        "PUBLISHED LIVE (no review) — will show in ~1-2 minutes.",
        "Key: " + event.key,
        "Style: " + event.style + "   Type: " + event.type,
        "When: " + [event.day_of_week, event.monthly_rule, event.start_date, event.start_time].filter(String).join(" "),
        "Venue: " + event.venue + (event.state ? " (" + event.state + ")" : ""),
        "Cost: " + (event.cost || "(none)"),
        "Flyer image committed: " + (opts.result ? opts.result.imagePath : "(see repo)"),
        (opts.result && opts.result.patternAdded ? "Recurring series pattern added: \"" + opts.result.patternAdded + "\"." : ""),
        "",
        "This event lives in web-events.json (overlay), NOT dance_events.json.",
        "To edit or remove it: ask Claude (\"remove the web event <key>\") — one overlay edit + push.",
        "To fold it into the real calendar (Google Calendar + backups): ask Claude to \"promote the web events into the master.\"",
      );
    } else if (opts.kind === "publish-failed") {
      lines.push(
        "AUTO-PUBLISH FAILED: " + (opts.detail || "unknown error"),
        "(Most likely GITHUB_TOKEN is missing or the PAT expired — check Script Properties.)",
        "The submission was NOT lost — it's in the Submissions sheet as \"pending\" for review.",
      );
    } else if (opts.kind === "pending") {
      lines.push(
        "A visitor filled out the details form and attached a flyer image.",
        event
          ? "Approving publishes the EVENT (details below) + its flyer to the live site together."
          : "NOTE: the typed details are incomplete, so Approve will publish the flyer only once the row is completed — review it in the dashboard first.",
      );
      if (event) {
        lines.push(
          "Key: " + event.key,
          "Style: " + event.style + "   Type: " + event.type,
          "When: " + [event.day_of_week, event.monthly_rule, event.start_date, event.start_time].filter(String).join(" "),
          "Venue: " + event.venue + (event.state ? " (" + event.state + ")" : ""),
          "Cost: " + (event.cost || "(none)"),
        );
      }
      const base = ScriptApp.getService().getUrl();
      const tokenRow = opts.row || row;
      lines.push(
        "",
        "APPROVE (publishes to the live site): ",
        base + "?action=flyer_review&row_id=" + tokenRow.row_id + "&decision=approve&t=" + tokenRow.flyer_token,
        "",
        "REJECT (discard): ",
        base + "?action=flyer_review&row_id=" + tokenRow.row_id + "&decision=reject&t=" + tokenRow.flyer_token
      );
    } else {
      lines.push(
        "The flyer couldn't be read confidently enough to build a complete event,",
        "so it was held as \"pending\" for a quick review rather than publishing something half-blank.",
        "Open Submission_Review.html (or the dashboard) to finish it, or ask Claude to add it.",
      );
    }
    lines.push("", "Flyer (Drive copy): " + (row.flyer_url || "(none)"));
    if (row.extra_flyer_urls) lines.push("More photos of the same flyer:", row.extra_flyer_urls);
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: (subjectByKind[opts.kind] || "New event: ") + title,
      body: lines.filter((l) => l !== undefined && l !== null).join("\n"),
      attachments: blob ? [blob] : [],
    });
  } catch (mailErr) {
    // Never fail the submission over a notification problem.
  }
}

/* Writes by the SHEET's actual header row order (2026-07-13) - immune to any
   column-order difference between code versions and the live sheet. */
function appendRow_(sheet, row) {
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  sheet.appendRow(header.map((h) => row[h] !== undefined ? row[h] : ""));
  // Force these columns to stay plain text. Sheets' smart type detection otherwise
  // rewrites HH:MM / YYYY-MM-DD-shaped strings (and, as of 2026-07-13, bare day-of-month
  // numbers in monthly_rule like "15") into date/time/number serial values, which come
  // back as JS Date/Number from getValues() (used by doGet/handleUpdate) instead of the
  // original strings - corrupting the value for the review artifact.
  // "cost" added 2026-07-23: a bare currency value like "$7" was being coerced by
  // Sheets into the number 7, silently losing the "$" on its way to the calendar.
  const textCols = ["start_date", "end_date", "start_time", "end_time", "monthly_rule", "cost"];
  const lastRow = sheet.getLastRow();
  textCols.forEach((col) => {
    const colIndex = header.indexOf(col) + 1;
    if (colIndex === 0) return;
    const cell = sheet.getRange(lastRow, colIndex);
    cell.setNumberFormat("@");
    if (row[col]) cell.setValue(row[col]);
  });
}

/* Sends the flyer photo(s) + a locked-down prompt to Gemini, asking for strict JSON back.
   images: [{ bytes, mime }] - one or more photos of the SAME flyer (2026-07-18: multi-photo
   uploads send front/back/close-ups together in one call). Returns null (never throws) on
   any failure so the submission still saves. */
function extractFlyerFields_(images) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) return null;
  const list = Array.isArray(images) ? images : [images];

  const prompt = [
    list.length > 1
      ? "You are reading " + list.length + " photos of the SAME flyer for one local dance event (front/back or close-ups). Combine what you can read across all photos into ONE event."
      : "You are reading a flyer image for a local dance event.",
    "Return ONLY compact JSON (no markdown, no commentary) with these exact keys:",
    '{"name":"","style":"","type":"","day_of_week":"","monthly_rule":"","start_date":"","end_date":"",',
    '"start_time":"","end_time":"","venue":"","cost":""}',
    "Rules:",
    "- style must be one of: West Coast Swing, Latin, Mixed, Argentine Tango, Other -- pick the closest match, or Other if unclear.",
    "- type must be one of: weekly_recurring, biweekly_recurring, monthly_recurring, one_time.",
    "- weekly_recurring: happens every week on one day -- fill day_of_week (e.g. \"Monday\").",
    "- biweekly_recurring: happens every OTHER week on one day (flyer says \"every other Monday\", \"biweekly\", \"every 2 weeks\", etc.) -- fill day_of_week, AND fill start_date with one actual date this happens if the flyer shows one (needed as a reference point to know which weeks), else \"\".",
    "- monthly_recurring: happens once a month -- fill monthly_rule as EITHER a weekday pattern like \"First Saturday\"/\"Third Tuesday\" OR, if the flyer instead gives a calendar date like \"the 15th of every month\", fill monthly_rule with just the bare day number, e.g. \"15\".",
    "- start_date/end_date must be YYYY-MM-DD if a specific date is shown, else \"\".",
    "- start_time/end_time must be 24-hour HH:MM if shown, else \"\".",
    "- venue should be the venue name and/or address as printed.",
    "- If a field genuinely isn't on the flyer, use \"\" -- never invent or guess a value.",
  ].join("\n");

  const parts = [{ text: prompt }];
  for (const img of list) {
    parts.push({ inline_data: { mime_type: img.mime, data: Utilities.base64Encode(img.bytes) } });
  }
  const payload = {
    contents: [{ parts: parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;

  try {
    const data = JSON.parse(res.getContentText());
    const text = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (parseErr) {
    return null;
  }
}

/* Approve/Reject/Edit from the review artifact. Requires the REVIEW_TOKEN (checked
   in doPost above before this runs). Updates only the fields provided, plus status
   and reviewed_at. Never touches canonical dance_events.json. */
function handleUpdate_(body) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const rowIdCol = header.indexOf("row_id");
  const statusCol = header.indexOf("status");
  const reviewedAtCol = header.indexOf("reviewed_at");

  for (let r = 1; r < data.length; r++) {
    if (data[r][rowIdCol] !== body.row_id) continue;
    const sheetRow = r + 1; // 1-indexed, +1 for header

    if (body.fields && typeof body.fields === "object") {
      for (const key of Object.keys(body.fields)) {
        const col = header.indexOf(key);
        if (col === -1 || key === "row_id" || key === "timestamp") continue; // never overwrite identity/timestamp
        const cell = sheet.getRange(sheetRow, col + 1);
        if (["start_date", "end_date", "start_time", "end_time", "monthly_rule", "cost"].indexOf(key) !== -1) {
          cell.setNumberFormat("@"); // keep date/time/monthly-rule/currency edits as plain text too
        }
        cell.setValue(String(body.fields[key]).slice(0, 500));
      }
    }

    // "published" added 2026-07-23: the dashboard's Archived-tab "Restore to live
    // updates" button sends it; it was missing here, so restores silently no-oped.
    if (body.status && ["pending", "approved", "rejected", "denied", "hold", "pending-fix", "applied", "fix-failed", "archived", "published"].includes(body.status)) {
      sheet.getRange(sheetRow, statusCol + 1).setValue(body.status);
      sheet.getRange(sheetRow, reviewedAtCol + 1).setValue(new Date().toISOString());
    }
    return jsonOut_({ ok: true });
  }
  return jsonOut_({ ok: false, error: "row_id not found" });
}

/* Delete a submission record without ever deleting canonical calendar data.
   Published-new rows may have a temporary overlay/logo artifact; published
   correction rows may have only an uploaded logo. Remove only artifacts that
   are explicitly tied to this row, then mark the Sheet record deleted. */
function handleDelete_(body) {
  if (!body || !body.row_id) return jsonOut_({ ok: false, error: "row_id is required" });

  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const col = (name) => header.indexOf(name);

  for (let r = 1; r < data.length; r++) {
    if (data[r][col("row_id")] !== body.row_id) continue;
    const sheetRow = r + 1;
    const row = {};
    header.forEach((h, i) => { row[h] = data[r][i]; });

    if (row.status === "deleted") return jsonOut_({ ok: true, removedFromSite: false });

    let removedFromSite = false;
    try {
      if (row.status === "published-new" && row.event_key) {
        removedFromSite = removeWebEvent_(row.event_key) || removedFromSite;
      }
      if (row.logo_path) {
        removedFromSite = removeUploadedLogo_(row.event_key, row.logo_path) || removedFromSite;
      }
    } catch (err) {
      return jsonOut_({ ok: false, error: "could not remove published artifacts: " + String(err).slice(0, 300) });
    }

    sheet.getRange(sheetRow, col("status") + 1).setValue("deleted");
    sheet.getRange(sheetRow, col("reviewed_at") + 1).setValue(new Date().toISOString());
    return jsonOut_({ ok: true, removedFromSite: removedFromSite });
  }
  return jsonOut_({ ok: false, error: "row_id not found" });
}

/* Remove one temporary overlay entry if the file exists. A missing overlay is
   normal because the current public viewer may have no web-events.json file. */
function removeWebEvent_(eventKey) {
  let current;
  try {
    current = githubRequest_("get", "contents/" + WEB_EVENTS_REPO_PATH + "?ref=" + GITHUB_BRANCH);
  } catch (err) {
    if (/HTTP 404/.test(String(err))) return false;
    throw err;
  }

  const text = Utilities.newBlob(Utilities.base64Decode(String(current.content).replace(/\s/g, ""))).getDataAsString("UTF-8");
  const overlay = JSON.parse(text);
  if (!overlay || !Array.isArray(overlay.events)) return false;
  const next = overlay.events.filter((event) => event && event.key !== eventKey);
  if (next.length === overlay.events.length) return false;
  overlay.events = next;
  githubRequest_("put", "contents/" + WEB_EVENTS_REPO_PATH, {
    message: "web-events: delete \"" + eventKey + "\" (review dashboard)",
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(overlay, null, 2) + "\n", "application/json").getBytes()),
    sha: current.sha,
    branch: GITHUB_BRANCH,
  });
  return true;
}

/* Remove only a logo mapping that points at this row's uploaded image. Existing
   canonical event logos and unrelated pattern mappings remain untouched. */
function removeUploadedLogo_(eventKey, logoPath) {
  let current;
  try {
    current = githubRequest_("get", "contents/" + LOGO_MAP_REPO_PATH + "?ref=" + GITHUB_BRANCH);
  } catch (err) {
    if (/HTTP 404/.test(String(err))) return false;
    throw err;
  }

  const text = Utilities.newBlob(Utilities.base64Decode(String(current.content).replace(/\s/g, ""))).getDataAsString("UTF-8");
  const map = JSON.parse(text);
  let changed = false;
  if (map.logos && eventKey && map.logos[eventKey] === logoPath) {
    delete map.logos[eventKey];
    changed = true;
  }
  if (Array.isArray(map.patterns)) {
    const next = map.patterns.filter((pattern) => !pattern || pattern.logo !== logoPath);
    changed = changed || next.length !== map.patterns.length;
    map.patterns = next;
  }
  if (!changed) return false;
  githubRequest_("put", "contents/" + LOGO_MAP_REPO_PATH, {
    message: "logo-map: remove deleted submission artifact",
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(map, null, 2) + "\n", "application/json").getBytes()),
    sha: current.sha,
    branch: GITHUB_BRANCH,
  });
  return true;
}

/* ---------- doGet: review artifact reads (token-gated) + one-click flyer review ---------- */
function doGet(e) {
  // One-click Approve/Reject links from the flyer notification emails (2026-07-13).
  // Gated by a per-row single-use token, NOT the master REVIEW_TOKEN, so the
  // master token never rides in an email URL.
  if (e.parameter.action === "flyer_review") {
    return handleFlyerReview_(e.parameter.row_id || "", e.parameter.decision || "", e.parameter.t || "");
  }

  if (!checkAuth_(e.parameter)) return jsonOut_({ ok: false, error: "unauthorized" });
  return handleList_(e.parameter.status);
}

/* Shared listing used by both doGet (local review tool) and doPost action:"list"
   (hosted dashboard). All filters optional: statusFilter (single string, legacy),
   statusList (array of statuses, 2026-07-23), intakeMethod (exact match). */
function handleList_(statusFilter, statusList, intakeMethod) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  let rows = data.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
  if (Array.isArray(statusList) && statusList.length) {
    rows = rows.filter((r) => statusList.indexOf(r.status) !== -1);
  } else if (statusFilter) {
    rows = rows.filter((r) => r.status === statusFilter);
  }
  if (intakeMethod) rows = rows.filter((r) => r.intake_method === intakeMethod);
  return jsonOut_({ ok: true, rows: rows });
}

function handleFlyerReview_(rowId, decision, token) {
  if (!rowId || !token || ["approve", "reject"].indexOf(decision) === -1) {
    return htmlOut_("Bad link", "This review link is incomplete. Use the links from the notification email.");
  }
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const col = (name) => header.indexOf(name);

  for (let r = 1; r < data.length; r++) {
    if (data[r][col("row_id")] !== rowId) continue;
    const sheetRow = r + 1;
    const storedToken = String(data[r][col("flyer_token")] || "");
    if (!storedToken || storedToken !== token) {
      return htmlOut_("Link expired", "This flyer was already reviewed (or the link is invalid). Nothing was changed.");
    }

    if (decision === "reject") {
      sheet.getRange(sheetRow, col("status") + 1).setValue("rejected");
      sheet.getRange(sheetRow, col("reviewed_at") + 1).setValue(new Date().toISOString());
      sheet.getRange(sheetRow, col("flyer_token") + 1).setValue(""); // single-use
      return htmlOut_("Rejected", "The flyer was discarded. Nothing was published.");
    }

    // Approve -> publish now.
    try {
      const fileId = String(data[r][col("flyer_file_id")] || "");
      if (!fileId) return htmlOut_("Missing image", "No stored image found for this submission.");
      const blob = DriveApp.getFileById(fileId).getBlob();

      // 2026-07-18: a held NEW-EVENT submission (untrusted form-path flyer) publishes
      // the EVENT + flyer together on approval, via the same overlay path trusted
      // submissions use. Corrections keep the original image-only behavior.
      const kind = String(data[r][col("submission_kind")] || "");
      if (kind === "new_event") {
        const rowObj = {};
        header.forEach((h, i) => { rowObj[h] = data[r][i]; });
        const built = buildEventFromRow_(rowObj);
        if (!built) {
          return htmlOut_("Details incomplete",
            "This submission's typed details aren't complete enough to publish as an event " +
            "(missing name/schedule/venue). Finish it in the review dashboard, or ask Claude to add it. " +
            "Nothing was published; the link stays valid.");
        }
        const result = publishNewEventToGitHub_(built.event, blob, rowId);
        sheet.getRange(sheetRow, col("status") + 1).setValue("published-new");
        sheet.getRange(sheetRow, col("reviewed_at") + 1).setValue(new Date().toISOString());
        sheet.getRange(sheetRow, col("published_at") + 1).setValue(new Date().toISOString());
        sheet.getRange(sheetRow, col("event_key") + 1).setValue(built.key);
        sheet.getRange(sheetRow, col("logo_path") + 1).setValue(result.logoPath);
        sheet.getRange(sheetRow, col("flyer_token") + 1).setValue(""); // single-use
        return htmlOut_("Event published",
          "\"" + built.event.name + "\" and its flyer are committed and will be live in ~1-2 minutes. " +
          "It lives in the web-events.json overlay - ask Claude to promote it into the master when convenient.");
      }

      const eventKey = String(data[r][col("event_key")] || "");
      const eventType = String(data[r][col("type")] || "");
      const result = publishFlyerToGitHub_(eventKey, eventType, blob, rowId);
      sheet.getRange(sheetRow, col("status") + 1).setValue("published");
      sheet.getRange(sheetRow, col("reviewed_at") + 1).setValue(new Date().toISOString());
      sheet.getRange(sheetRow, col("published_at") + 1).setValue(new Date().toISOString());
      sheet.getRange(sheetRow, col("logo_path") + 1).setValue(result.logoPath);
      sheet.getRange(sheetRow, col("flyer_token") + 1).setValue(""); // single-use
      return htmlOut_("Published",
        "The flyer is committed and will be live on the site in ~1-2 minutes." +
        (result.patternAdded ? " A series pattern (\"" + result.patternAdded + "\") was added so recurring sibling listings pick it up too." : ""));
    } catch (pubErr) {
      return htmlOut_("Publish failed", "Error: " + String(pubErr).slice(0, 300) +
        " - the link is still valid; fix the cause (usually GITHUB_TOKEN) and click Approve again.");
    }
  }
  return htmlOut_("Not found", "No submission matches this link.");
}

/* ============================================================================
   DESIGNED-GRAPHIC-BY-EMAIL  

   Flow: viewer visitor selects several dances -> "Email me a designed graphic"
   -> enters email -> POST { action:"poster_request", email, events[], headline,
   requested_date } to this /exec. handlePosterRequest_ validates, rate-limits,
   LOGS the request (usage tracking) and queues it. A 1-minute time-driven trigger
   (processPosterQueue_) generates a seasonal poster with Gemini's image model,
   inserting the selected events' EXACT text, and emails it via MailApp.

   ONE-TIME SETUP (the owner, from the editor): Run > setupPosterQueue  -- this both
   grants the trigger scope and installs the every-minute generator. After that,
   ensurePosterTrigger_ keeps it installed automatically.
   ============================================================================ */

function getPosterSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(POSTER_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(POSTER_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(POSTER_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* Writes by the sheet's actual header order - immune to column reordering. */
function appendPosterRow_(sheet, row) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const arr = header.map(function (h) { return Object.prototype.hasOwnProperty.call(row, h) ? row[h] : ""; });
  sheet.appendRow(arr);
}

/* Graphics requested by one email in the last rolling 24h (outright failures don't count). */
function countRecentPosterRequests_(sheet, email) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  const header = data[0];
  const emailCol = header.indexOf("email");
  const tsCol = header.indexOf("timestamp");
  const statusCol = header.indexOf("status");
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const target = String(email).toLowerCase();
  let count = 0;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][emailCol] || "").toLowerCase() !== target) continue;
    if (String(data[r][statusCol] || "") === "failed") continue;
    const t = Date.parse(String(data[r][tsCol] || ""));
    if (!isNaN(t) && t >= cutoff) count++;
  }
  return count;
}

function handlePosterRequest_(body) {
  try {
    const email = String(body.email || "").trim().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return jsonOut_({ ok: false, error: "Please enter a valid email address." });
    }
    let events = Array.isArray(body.events) ? body.events : [];
    if (!events.length) return jsonOut_({ ok: false, error: "No dances were selected." });
    if (events.length > POSTER_MAX_EVENTS) events = events.slice(0, POSTER_MAX_EVENTS);
    events = events.map(function (e) {
      e = e || {};
      return {
        name:  String(e.name  || "").trim().slice(0, 120),
        day:   String(e.day   || "").trim().slice(0, 20),
        date:  String(e.date  || "").trim().slice(0, 40),
        when:  String(e.when  || "").trim().slice(0, 80),
        time:  String(e.time  || "").trim().slice(0, 40),
        venue: String(e.venue || "").trim().slice(0, 120),
        cost:  String(e.cost  || "").trim().slice(0, 60),
      };
    }).filter(function (e) { return e.name; });
    if (!events.length) return jsonOut_({ ok: false, error: "No dances were selected." });

    const headline = String(body.headline || "").trim().slice(0, 160);
    const requestedDate = /^\d{4}-\d{2}-\d{2}/.test(String(body.requested_date || ""))
      ? String(body.requested_date).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    let monthIdx = 6; // fallback July
    try { monthIdx = new Date(requestedDate + "T12:00:00").getMonth(); } catch (e) {}

    const sheet = getPosterSheet_();

    if (countRecentPosterRequests_(sheet, email) >= POSTER_DAILY_CAP) {
      return jsonOut_({ ok: false, error:
        "You've reached today's limit of " + POSTER_DAILY_CAP + " graphics. Please try again tomorrow." });
    }

    const row = {
      timestamp: new Date().toISOString(),
      request_id: Utilities.getUuid(),
      email: email,
      status: "queued",
      event_count: events.length,
      headline: headline,
      events_json: JSON.stringify(events).slice(0, 45000),
      requested_date: requestedDate,
      month: monthIdx + 1,
      attempts: 0,
      sent_at: "",
      error: "",
    };
    appendPosterRow_(sheet, row);

    ensurePosterTrigger_(); // idempotent; only creates the generator trigger if missing

    return jsonOut_({ ok: true, queued: true,
      message: "On its way! We're designing your graphic and will email it to " + email + " in a few minutes." });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err).slice(0, 200) });
  }
}

/* Keeps the every-minute generator installed. Safe to call on every request; it only
   creates the trigger when one isn't already present. Wrapped so a missing trigger
   scope (before the owner runs setupPosterQueue once) never breaks request logging. */
function ensurePosterTrigger_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "processPosterQueue_") return;
    }
    ScriptApp.newTrigger("processPosterQueue_").timeBased().everyMinutes(1).create();
  } catch (e) {
    appendOperationalEvent_({ phase: "trigger-registration", operation: "ensure processPosterQueue_ trigger", status: "FAILED",
      error: { category: "trigger-registration", message: e && e.message ? e.message : e },
      verification: "trigger could not be enumerated or created", next_action: "run setupPosterQueue() from the Apps Script editor", evidence: "OperationalLog" });
  }
}

/* Run ONCE from the editor (Run > setupPosterQueue) to grant the trigger scope and
   (re)install the background generator. De-dupes, so re-running is harmless. */
function setupPosterQueue() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "processPosterQueue_") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("processPosterQueue_").timeBased().everyMinutes(1).create();
  return "Poster queue trigger installed - processPosterQueue_ runs every minute.";
}

/* The background generator. Picks up "queued"/"retry" rows, generates a poster, emails
   it, and records the outcome. A lock keeps overlapping minute-passes from double-sending. */
function processPosterQueue_() {
  const lock = LockService.getScriptLock();
  const runId = Utilities.getUuid();
  if (!lock.tryLock(5000)) {
    appendOperationalEvent_({ trigger_id: "processPosterQueue_", run_id: runId, phase: "lock", operation: "acquire poster queue lock", status: "BLOCKED",
      error: { category: "lock-contention", message: "Script lock was not acquired within 5000ms" }, retry: "next minute trigger", verification: "no queue rows processed", next_action: "retry on next trigger", evidence: "OperationalLog" });
    return;
  }
  try {
    const sheet = getPosterSheet_();
    const data = sheet.getDataRange().getValues();
    const header = data[0];
    const col = function (n) { return header.indexOf(n); };
    let done = 0;
    for (let r = 1; r < data.length && done < POSTER_BATCH_PER_RUN; r++) {
      const status = String(data[r][col("status")] || "");
      if (status !== "queued" && status !== "retry") continue;
      const sheetRow = r + 1;
      const email = String(data[r][col("email")] || "");
      const headline = String(data[r][col("headline")] || "");
      const monthNum = Number(data[r][col("month")] || 0);
      let events;
      try { events = JSON.parse(String(data[r][col("events_json")] || "[]")); }
      catch (e) { events = []; }
      const attempts = Number(data[r][col("attempts")] || 0) + 1;

      // Mark in-flight + bump attempts BEFORE the slow call, so the next minute-pass
      // won't grab the same row while generation is running.
      sheet.getRange(sheetRow, col("status") + 1).setValue("processing");
      sheet.getRange(sheetRow, col("attempts") + 1).setValue(attempts);
      SpreadsheetApp.flush();
      done++;

      try {
        if (!email || !events.length) throw new Error("missing email or events");
        const blob = generatePosterImage_(events, headline, monthNum);
        if (!blob) throw new Error("image generation returned no image");
        sendPosterEmail_(email, headline, events, blob);
        sheet.getRange(sheetRow, col("status") + 1).setValue("sent");
        sheet.getRange(sheetRow, col("sent_at") + 1).setValue(new Date().toISOString());
        sheet.getRange(sheetRow, col("error") + 1).setValue("");
        appendOperationalEvent_({ trigger_id: "processPosterQueue_", run_id: runId, phase: "send", operation: "generate and email poster", status: "COMPLETED",
          attempted_write: true, persisted_write: true, verification: "PosterRequests row marked sent and email send returned", impact: "poster delivered", evidence: "OperationalLog" });
      } catch (genErr) {
        const msg = String(genErr).slice(0, 300);
        if (attempts >= POSTER_MAX_ATTEMPTS) {
          sheet.getRange(sheetRow, col("status") + 1).setValue("failed");
          sheet.getRange(sheetRow, col("error") + 1).setValue(msg);
          notifyPosterFailure_(email, headline, msg);
        } else {
          sheet.getRange(sheetRow, col("status") + 1).setValue("retry");
          sheet.getRange(sheetRow, col("error") + 1).setValue(msg);
        }
        appendOperationalEvent_({ trigger_id: "processPosterQueue_", run_id: runId, phase: "generate-or-send", operation: "generate and email poster", status: attempts >= POSTER_MAX_ATTEMPTS ? "FAILED" : "PARTIAL",
          error: { category: "poster-processing", message: msg }, attempted_write: true, persisted_write: true, retry: attempts < POSTER_MAX_ATTEMPTS ? attempts : "exhausted",
          verification: "PosterRequests row status persisted as " + (attempts >= POSTER_MAX_ATTEMPTS ? "failed" : "retry"), next_action: attempts >= POSTER_MAX_ATTEMPTS ? "inspect error and repair before retry" : "retry on next minute trigger", evidence: "OperationalLog" });
      }
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }
}

/* Per-month seasonal art direction (1=Jan .. 12=Dec), Gulf-Coast / Pensacola flavored. */
const POSTER_MONTH_THEMES = {
  1:  "Deep winter cozy: midnight-blue and silver palette, soft snow sparkle, warm string lights, frosted edges.",
  2:  "Valentine warmth: rich reds, blush pinks and gold, hearts and roses woven subtly into the header.",
  3:  "Early spring & Gulf-Coast Mardi Gras: fresh greens with purple-green-gold accents, blossoms and a hint of festive beads.",
  4:  "Spring bloom: pastel florals, azaleas and dogwood, soft sunlight, airy and fresh.",
  5:  "Late spring: vivid wildflowers, warm sun, lush greens, a gentle breezy feel.",
  6:  "Early Gulf summer: teal ocean, warm sand, coral sunset, palm silhouettes.",
  7:  "High summer on the Gulf: bright turquoise water, warm sunset gold, palms, a sparkle of festive summer light.",
  8:  "Late summer golden hour: warm amber and rose, tropical foliage, hazy sun.",
  9:  "Early autumn: warm amber and terracotta, first turning leaves, soft golden light.",
  10: "Autumn & Halloween: burnt orange, deep purple and moody moonlit tones, falling leaves.",
  11: "Late autumn harvest: rich rust, gold and deep red, cozy gratitude warmth.",
  12: "Winter holidays: festive evergreen, gold and crimson, twinkling lights, a joyful celebratory glow.",
};

function buildPosterPrompt_(events, headline, monthNum) {
  const theme = POSTER_MONTH_THEMES[monthNum] || POSTER_MONTH_THEMES[7];
  const title = headline || "Dance Chances Coming Up!";
  const lines = [];
  lines.push("Design a beautiful, professional PORTRAIT (tall vertical) event poster / weekly dance guide for a local social-dance community on the Gulf Coast (Pensacola, Florida area).");
  lines.push("");
  lines.push("SEASONAL STYLE for this month: " + theme);
  lines.push("Warm, elegant, celebratory and modern. Put the decorative seasonal art in the HEADER and BORDERS only - keep the event-listing area clean, high-contrast and very easy to read.");
  lines.push("");
  lines.push("LAYOUT:");
  lines.push("- A rich illustrated header band at the top carrying the title.");
  lines.push("- Below it, a clean vertical list of event rows. Each row: a bold day/date badge on the left, then the event name, with time, venue and price beneath it.");
  lines.push("- A small footer strip reading exactly: danceeventviewer.net");
  lines.push("");
  lines.push("CRITICAL - TEXT ACCURACY: Render every piece of text below EXACTLY as written, character for character. Do NOT paraphrase, abbreviate, translate, reorder, correct spelling, or invent any text. Do NOT add any events, dates, times, prices, or words that are not listed here. Use clean, legible typography.");
  lines.push("");
  lines.push("TITLE (render exactly): " + title);
  lines.push("");
  lines.push("EVENTS (render each exactly; " + events.length + " total):");
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const badge = e.day && e.date ? (e.day + " " + e.date) : (e.day || e.date || "");
    const parts = [(i + 1) + ")"];
    if (badge) parts.push("[" + badge + "]");
    parts.push("NAME: " + e.name);
    if (e.time) parts.push("| TIME: " + e.time);
    else if (e.when) parts.push("| WHEN: " + e.when);
    if (e.venue) parts.push("| VENUE: " + e.venue);
    if (e.cost) parts.push("| PRICE: " + e.cost);
    lines.push(parts.join(" "));
  }
  lines.push("");
  lines.push("Output only the finished poster image.");
  return lines.join("\n");
}

/* Calls OpenAI's image API (POST /v1/images/generations, model gpt-image-1) and returns
   a PNG blob. gpt-image-1 always returns base64 in data[0].b64_json (no response_format
   param). Throws on any non-200 so processPosterQueue_ can retry / surface the error. */
function generatePosterImage_(events, headline, monthNum) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const prompt = buildPosterPrompt_(events, headline, monthNum);
  const payload = {
    model: POSTER_IMAGE_MODEL,      // "gpt-image-1"
    prompt: prompt,
    size: POSTER_IMAGE_SIZE,        // portrait
    quality: POSTER_IMAGE_QUALITY,  // low | medium | high
    n: 1,
  };
  const res = UrlFetchApp.fetch("https://api.openai.com/v1/images/generations", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error("OpenAI HTTP " + code + ": " + res.getContentText().slice(0, 300));
  let data;
  try { data = JSON.parse(res.getContentText()); } catch (e) { throw new Error("bad JSON from OpenAI"); }
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error("no image in OpenAI response");
  return Utilities.newBlob(Utilities.base64Decode(b64), "image/png", "dance-graphic.png");
}

function sendPosterEmail_(email, headline, events, blob) {
  const subject = "Your dance graphic: " + (headline || "dances coming up");
  const body = [
    "Here's your designed graphic of the dances you picked on Dance Event Viewer.",
    "",
    headline || "",
    "",
  ];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const bits = [e.name];
    if (e.when || e.time) bits.push(e.when || e.time);
    if (e.venue) bits.push(e.venue);
    if (e.cost) bits.push(e.cost);
    body.push("• " + bits.filter(Boolean).join(" — "));
  }
  body.push("", "See them all at danceeventviewer.net", "",
    "(This graphic was AI-designed - if any detail looks off, the listing on the site is the source of truth.)");
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body.join("\n"),
    name: "Dance Event Viewer",
    attachments: [blob],
  });
}

function notifyPosterFailure_(email, headline, msg) {
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: "Dance graphic FAILED for " + email,
      body: "A designed-graphic request failed after " + POSTER_MAX_ATTEMPTS + " attempts.\n\n" +
            "Requester: " + email + "\nTitle: " + headline + "\nLast error: " + msg + "\n\n" +
            "The row is marked 'failed' in the PosterRequests sheet. Common causes: the " +
            "OPENAI_API_KEY is missing/out of credit, or the OpenAI org isn't verified for " + POSTER_IMAGE_MODEL + ".",
    });
  } catch (e) { /* never fail over a notification */ }
}

/* ONE-OFF CONFIDENCE CHECK - Run this from the editor (Run > testPosterImageModel).
   Generates a sample poster with the current OPENAI_API_KEY + POSTER_IMAGE_MODEL and
   emails it to the owner. Returns a status string (also in the execution log). Use it to
   confirm the key/model/credit actually work before real visitors do - if the key is
   unfunded or the org isn't verified for image generation, this is where you'll find out. */
function testPosterImageModel() {
  const events = [
    { name: "Saturday Night Swing", day: "Saturday", date: "Jul 26", when: "", time: "7:00pm-10:00pm", venue: "The Hub, Pensacola", cost: "$10" },
    { name: "Sunday Blues Social", day: "Sunday", date: "Jul 27", when: "", time: "6:30pm-9:00pm", venue: "Loft 21", cost: "Free" },
  ];
  try {
    const blob = generatePosterImage_(events, "Two dance chances this weekend!", new Date().getMonth() + 1);
    if (!blob) return "FAILED: request succeeded but returned no image (usually quota or model access).";
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: "TEST: dance poster image model works",
      body: "If a poster is attached, OPENAI_API_KEY can generate images with " + POSTER_IMAGE_MODEL + " - the feature is good to go.",
      attachments: [blob],
    });
    return "OK: sample poster emailed to " + NOTIFY_EMAIL + ".";
  } catch (e) {
    return "FAILED: " + String(e);
  }
}
