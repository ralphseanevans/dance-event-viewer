type SignupNotification = {
  id: string;
  user_id: string;
  email: string;
  auth_provider: string;
  status: "queued" | "sending" | "sent";
  attempt_count: number;
  created_at: string;
};

type WebhookPayload = {
  type: "INSERT";
  table: "dashboard_signup_notifications";
  schema: "public";
  record: SignupNotification;
  old_record: null;
};

const jsonHeaders = { "Content-Type": "application/json" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function getSecretKey(): string | undefined {
  const modernKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernKeys) {
    try {
      return (JSON.parse(modernKeys) as Record<string, string>).default;
    } catch {
      return undefined;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? undefined;
}

// Key the database trigger sends in x-webhook-secret. Prefer the platform-injected
// SUPABASE_SECRET_KEYS map (entry "signup-trigger"); fall back to SIGNUP_TRIGGER_KEY.
function getTriggerKey(): string | undefined {
  const modernKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernKeys) {
    try {
      const value = (JSON.parse(modernKeys) as Record<string, string>)["signup-trigger"];
      if (value) return value;
    } catch {
      // fall through
    }
  }
  return Deno.env.get("SIGNUP_TRIGGER_KEY") ?? undefined;
}

function adminHeaders(secretKey: string, returning = false): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secretKey,
    "Content-Type": "application/json",
    Prefer: returning ? "return=representation" : "return=minimal",
  };
  // Modern sb_secret keys belong only in apikey. Legacy JWT service-role keys also
  // need Authorization until the project finishes its key migration.
  if (!secretKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function updateQueue(
  supabaseUrl: string,
  secretKey: string,
  id: string,
  expectedStatus: SignupNotification["status"] | undefined,
  changes: Record<string, unknown>,
  returning = false,
): Promise<SignupNotification[]> {
  const filter = new URLSearchParams({ id: `eq.${id}`, select: "*" });
  if (expectedStatus) filter.set("status", `eq.${expectedStatus}`);
  const response = await fetch(
    `${supabaseUrl}/rest/v1/dashboard_signup_notifications?${filter.toString()}`,
    {
      method: "PATCH",
      headers: adminHeaders(secretKey, returning),
      body: JSON.stringify(changes),
    },
  );
  if (!response.ok) throw new Error(`Queue update returned HTTP ${response.status}`);
  return returning ? await response.json() as SignupNotification[] : [];
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  // verify_jwt is OFF for this function (sb_secret keys are not JWTs), so the
  // function authenticates the database trigger itself with a shared secret.
  const expectedSecret = getTriggerKey();
  if (!expectedSecret) {
    console.error("signup-trigger key not found in SUPABASE_SECRET_KEYS or SIGNUP_TRIGGER_KEY.");
    return new Response(JSON.stringify({ error: "Notification service is not configured" }), {
      status: 503,
      headers: jsonHeaders,
    });
  }
  const providedSecret = request.headers.get("x-webhook-secret") ?? "";
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const ownerEmail = Deno.env.get("OWNER_NOTIFICATION_EMAIL");
  const fromEmail = Deno.env.get("SIGNUP_NOTIFICATION_FROM_EMAIL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();

  if (!resendKey || !ownerEmail || !fromEmail || !supabaseUrl || !secretKey) {
    console.error("Signup notification function is missing required server secrets.");
    return new Response(JSON.stringify({ error: "Notification service is not configured" }), {
      status: 503,
      headers: jsonHeaders,
    });
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json() as WebhookPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: jsonHeaders });
  }

  if (
    payload.type !== "INSERT" ||
    payload.schema !== "public" ||
    payload.table !== "dashboard_signup_notifications" ||
    !payload.record?.id
  ) {
    return new Response(JSON.stringify({ error: "Unexpected webhook payload" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  let claimed: SignupNotification | undefined;
  try {
    const rows = await updateQueue(supabaseUrl, secretKey, payload.record.id, "queued", {
      status: "sending",
      attempt_count: payload.record.attempt_count + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, true);
    claimed = rows[0];
  } catch (error) {
    console.error("Could not claim signup notification", error);
    return new Response(JSON.stringify({ error: "Could not claim notification" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
  if (!claimed) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers: jsonHeaders });
  }

  const dashboardUrl = Deno.env.get("DASHBOARD_URL") ??
    "https://danceeventviewer.net/dance-event-viewer/dashboard/";
  const safeEmail = escapeHtml(claimed.email);
  const safeProvider = escapeHtml(claimed.auth_provider);
  const createdAt = new Date(claimed.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `dashboard-signup/${claimed.id}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [ownerEmail],
        subject: "New Dance Dashboard signup awaiting approval",
        html: `
          <h2>New dashboard signup</h2>
          <p><strong>${safeEmail}</strong> created a Dance Dashboard account.</p>
          <p>Sign-in method: ${safeProvider}<br>Created: ${escapeHtml(createdAt)} Central</p>
          <p>The account is inactive and cannot see event records until you approve it.</p>
          <p><a href="${escapeHtml(dashboardUrl)}">Review people in the Dance Dashboard</a></p>
        `,
      }),
    });
    const responseBody = await response.json() as { id?: string; message?: string };
    if (!response.ok || !responseBody.id) {
      throw new Error(responseBody.message ?? `Email provider returned HTTP ${response.status}`);
    }

    await updateQueue(supabaseUrl, secretKey, claimed.id, "sending", {
        status: "sent",
        email_provider_id: responseBody.id,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown notification error";
    console.error("Signup notification delivery failed", message);
    await updateQueue(supabaseUrl, secretKey, claimed.id, undefined, {
        status: "queued",
        last_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      });
    return new Response(JSON.stringify({ error: "Email delivery failed" }), {
      status: 502,
      headers: jsonHeaders,
    });
  }
});
