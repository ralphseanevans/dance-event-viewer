// Submission trust: a typed name grants nothing; only Supabase RLS (admin Google account)
// can approve. Admin sign-in redirects back to the current origin (localhost works).
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, root))).digest('hex').slice(0, 8);

const SID = '11111111-2222-4333-8444-555555555555';

function loadAuth(origin, pathname) {
  const calls = [];
  const listeners = {};
  const client = {
    auth: {
      signInWithOAuth: (args) => { calls.push(args); return Promise.resolve({}); },
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: {} } }),
      signOut: () => Promise.resolve({}),
    },
  };
  const window = {
    supabase: { createClient: () => client },
    DANCE_EVENT_VIEWER_SUPABASE: { enabled: true, url: 'https://example.supabase.co', publishableKey: 'x', adminEmails: ['ralphseanevans@gmail.com'] },
    location: { origin, pathname, href: `${origin}${pathname}?q=1#frag` },
    dispatchEvent: () => {},
  };
  window.ADMIN_EMAILS = window.DANCE_EVENT_VIEWER_SUPABASE.adminEmails;
  const document = {
    readyState: 'loading',
    addEventListener: (t, fn) => { listeners[t] = fn; },
    documentElement: { classList: { toggle: () => {} } },
    querySelectorAll: () => [],
  };
  vm.runInNewContext(read('dance-event-viewer/js/auth.js'), { window, document, CustomEvent: class {} });
  return { auth: window.DEV_AUTH, calls };
}

test('admin sign-in uses Google with redirectTo = origin + path (production, localhost, 127.0.0.1)', async () => {
  for (const origin of ['https://danceeventviewer.net', 'http://localhost:8123', 'http://127.0.0.1:8123']) {
    const { auth, calls } = loadAuth(origin, '/dance-event-viewer/submit-event.html');
    await auth.signIn();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, 'google');
    assert.equal(calls[0].options.redirectTo, `${origin}/dance-event-viewer/submit-event.html`);
  }
});

test('the cosmetic admin check is by signed-in email, never by a typed name', () => {
  const { auth } = loadAuth('http://localhost:8123', '/');
  assert.equal(auth.isAdmin({ user: { email: 'RalphSeanEvans@gmail.com' } }), true);
  assert.equal(auth.isAdmin({ user: { email: 'ralph@example.com' } }), false);
  assert.equal(auth.isAdmin(null), false);
});

function loadSubmissions({ session, isAdmin, failApproved = false, rpcImpl = null, timers = null }) {
  const calls = [];
  let n = 0;
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    from: () => { throw new Error('direct table access is not used for filing'); },
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (rpcImpl) return rpcImpl(fn, args, calls.length);
      if (failApproved && args.p_status === 'approved') return Promise.resolve({ data: null, error: { code: '42501', message: 'only an admin may file an approved submission' } });
      return Promise.resolve({ data: { id: `${SID.slice(0, -1)}${++n}`, status: args.p_status }, error: null });
    },
  };
  let k = 0;
  const window = {
    DEV_AUTH: { client, isAdmin: () => isAdmin },
    crypto: { randomUUID: () => `aaaaaaaa-bbbb-4ccc-8ddd-${String(++k).padStart(12, '0')}`, subtle: webcrypto.subtle },
  };
  vm.runInNewContext(read('dance-event-viewer/js/submissions.js'), {
    window, TextEncoder,
    setTimeout: timers ? timers.setTimeout : setTimeout,
    clearTimeout: timers ? timers.clearTimeout : clearTimeout,
  });
  return { subs: window.DEV_SUBMISSIONS, calls };
}

test('anonymous submissions (even named "Ralph") are filed as pending via the RPC, with no token', async () => {
  const { subs, calls } = loadSubmissions({ session: null, isAdmin: false });
  const payload = { intake_method: 'form', contact_name: 'Ralph', name: 'Social', flyer_base64: 'AAA' };
  const rec = await subs.attach(payload);
  assert.equal(rec.status, 'pending');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'submit_submission');
  assert.equal(calls[0].args.p_status, 'pending');
  assert.equal(calls[0].args.p_row.flyer_count, 1);
  assert.equal('flyer_base64' in calls[0].args.p_row, false, 'images never go to Supabase');
  assert.equal('supabase_access_token' in payload, false);
});

test('fix 4: the client never sends an id; the server-returned id is used', async () => {
  const { subs, calls } = loadSubmissions({ session: null, isAdmin: false,
    rpcImpl: () => Promise.resolve({ data: { id: SID, status: 'pending' }, error: null }) });
  const payload = { intake_method: 'form', contact_name: 'x', name: 'Social' };
  await subs.attach(payload);
  const row = calls[0].args.p_row;
  assert.equal('id' in row, false);
  assert.equal('status' in row, false);
  assert.equal(payload.supabase_submission_id, SID);
  assert.equal('id' in subs.buildRow({ name: 'a' }), false);
  const src = read('dance-event-viewer/js/submissions.js');
  assert.doesNotMatch(src, /\.insert\(/, 'no direct table insert');
});

test('admin session asks for approved and forwards its token; refusal falls back to pending with the same key', async () => {
  const session = { access_token: 'test-access-token', user: { email: 'ralphseanevans@gmail.com' } };
  const ok = loadSubmissions({ session, isAdmin: true });
  const p1 = { intake_method: 'flyer' };
  const r1 = await ok.subs.attach(p1);
  assert.equal(r1.status, 'approved');
  assert.match(ok.calls[0].args.p_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(p1.supabase_access_token, 'test-access-token');

  const refused = loadSubmissions({ session, isAdmin: true, failApproved: true });
  const p2 = { intake_method: 'flyer' };
  assert.equal((await refused.subs.attach(p2)).status, 'pending');
  assert.deepEqual(refused.calls.map(c => c.args.p_status), ['approved', 'pending']);
  assert.equal(refused.calls[0].args.p_client_key, refused.calls[1].args.p_client_key);
  assert.equal('supabase_access_token' in p2, false);
});

test('fix 1: a hanging Supabase call is capped at ~4s, then the caller continues without a row', async () => {
  const delays = [];
  const timers = { setTimeout: (fn, ms) => { delays.push(ms); return setTimeout(fn, 5); }, clearTimeout };
  const { subs } = loadSubmissions({ session: null, isAdmin: false, timers, rpcImpl: () => new Promise(() => {}) });
  const payload = { intake_method: 'form', contact_name: 'x' };
  const r = await Promise.race([subs.attach(payload).then(v => ({ v })), new Promise(res => setTimeout(() => res('hung'), 1000))]);
  assert.notEqual(r, 'hung', 'attach must resolve when Supabase hangs');
  assert.equal(r.v, null);
  assert.equal('supabase_submission_id' in payload, false);
  assert.ok(delays.length >= 1 && delays.every(ms => ms >= 3000 && ms <= 5000), `cap ${delays}`);
  assert.equal(subs.TIMEOUT_MS, 4000);
  // A Supabase getSession hang is capped too.
  const window = { DEV_AUTH: { client: { auth: { getSession: () => new Promise(() => {}) } }, isAdmin: () => false }, crypto: { subtle: webcrypto.subtle } };
  vm.runInNewContext(read('dance-event-viewer/js/submissions.js'), { window, TextEncoder, setTimeout: timers.setTimeout, clearTimeout });
  assert.equal(await window.DEV_SUBMISSIONS.attach({}), null);
});

test('fix 1: callers still await attach before the Apps Script POST', () => {
  assert.match(read('dance-event-viewer/js/submit-event.js'), /await window\.DEV_SUBMISSIONS\.attach\(payload\);\s*const res = await fetch\(SUBMIT_ENDPOINT/);
  assert.equal((read('dance-event-viewer/js/app.js').match(/await window\.DEV_SUBMISSIONS\.attach\(payload\);\s*const res = await fetch\(SUBMIT_ENDPOINT/g) || []).length, 2);
});

test('fix 6: retries of the same submission reuse one client_key (also after a timeout); new content gets a new one', async () => {
  let hang = true;
  const timers = { setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? 5 : ms), clearTimeout };
  const { subs, calls } = loadSubmissions({ session: null, isAdmin: false, timers,
    rpcImpl: (fn, args) => (hang ? new Promise(() => {}) : Promise.resolve({ data: { id: SID, status: 'pending' }, error: null })) });
  const make = () => ({ intake_method: 'form', contact_name: 'Ralph', name: 'Social', flyer_base64: 'AAA' });
  assert.equal(await subs.attach(make()), null);           // timed out: the row may exist server-side
  hang = false;
  const retry = make();
  await subs.attach(retry);                                 // user presses Submit again
  await subs.attach(make());                                // and again
  await subs.attach({ ...make(), name: 'Other social' });   // a different submission
  const keys = calls.map(c => c.args.p_client_key);
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
  assert.notEqual(keys[2], keys[3]);
  assert.equal(retry.supabase_submission_id, SID);
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql');
  assert.match(sql, /client_key\s+uuid not null unique/);
  assert.match(sql, /where s\.client_key = p_client_key;\s*if found then return/);
  assert.match(sql, /on conflict \(client_key\) do nothing/);
});

function loadAppsScript({ props = {}, fetchResult }) {
  const fetches = [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    UrlFetchApp: { fetch: (url, opts) => { fetches.push({ url, opts }); return fetchResult(url, opts); } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, str) => Array.from(createHash('sha256').update(str, 'utf8').digest(), b => (b > 127 ? b - 256 : b)),
    },
    SpreadsheetApp: {}, DriveApp: {}, MailApp: {}, HtmlService: {}, ContentService: {}, Session: {}, LockService: {}, ScriptApp: {},
  };
  vm.runInNewContext(read('tools/apps-script/Submission_AppsScript_Code.gs'), ctx);
  return { ctx, fetches };
}
const okResponse = (rows, code = 200) => () => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(rows) });

/* A tiny stand-in for the submissions table behind PostgREST + RLS: only ADMIN_TOKEN may
   update; the PATCH matches id, status=approved, consumed_at is null and payload_hash. */
function fakeSupabase(rows) {
  return (url, opts) => {
    const q = new URL(url).searchParams;
    const isAdmin = opts.headers.Authorization === 'Bearer admin-token-zz9';
    const hit = rows.filter(r => isAdmin && opts.method === 'patch' && `eq.${r.id}` === q.get('id') && `eq.${r.status}` === q.get('status') &&
      q.get('consumed_at') === 'is.null' && r.consumed_at == null && `eq.${r.payload_hash}` === q.get('payload_hash'));
    hit.forEach(r => { r.consumed_at = 'now'; });
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(hit.map(r => ({ id: r.id, status: r.status }))) };
  };
}

test('Apps Script: typed names never grant trust', () => {
  const gs = read('tools/apps-script/Submission_AppsScript_Code.gs');
  assert.doesNotMatch(gs, /TRUSTED_NAME_RE\s*[=.]|getProperty\("TRUSTED_NAME_PATTERN"\)/);
  assert.doesNotMatch(gs, /(trust|trusted)[^\n]*contact_name|contact_name[^\n]*\.test\(/i);
  const { ctx, fetches } = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: okResponse([]) });
  for (const name of ['Ralph', 'ralph', 'admin123', 'Ralph (authenticated dashboard)']) {
    assert.deepEqual({ ...ctx.submissionTrust_({ contact_name: name }) }, { trusted: false, basis: 'none' });
  }
  assert.equal(fetches.length, 0, 'no Supabase call without a submission id + token');
});

test('Apps Script: trust only when the caller\'s own token can consume an approved row (RLS)', () => {
  const body0 = { intake_method: 'flyer', contact_name: 'anyone', flyer_base64: 'AAA' };
  const probe = loadAppsScript({ fetchResult: okResponse([]) });
  const hash = probe.ctx.payloadHash_(body0);
  const approved = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: okResponse([{ id: SID, status: 'approved' }]) });
  const t = approved.ctx.submissionTrust_({ ...body0, supabase_submission_id: SID, supabase_access_token: 'fake-test-token-zz9' });
  assert.equal(t.trusted, true);
  assert.equal(t.basis, 'supabase-admin');
  const f = approved.fetches[0];
  assert.equal(f.opts.method, 'patch');
  assert.equal(f.opts.headers.Prefer, 'return=representation');
  assert.equal(f.url, `https://xyyxbwetagfexsqtokpk.supabase.co/rest/v1/submissions?select=id,status&status=eq.approved&consumed_at=is.null&id=eq.${SID}&payload_hash=eq.${hash}`);
  assert.equal(f.opts.headers.Authorization, 'Bearer fake-test-token-zz9');
  assert.doesNotMatch(f.url, /fake-test-token-zz9/, 'token never goes in a URL');

  const denied = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: okResponse({ message: 'permission denied' }, 401) });
  assert.equal(denied.ctx.submissionTrust_({ supabase_submission_id: SID, supabase_access_token: 'anon' }).trusted, false);
  const empty = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: okResponse([]) });
  assert.equal(empty.ctx.submissionTrust_({ supabase_submission_id: SID, supabase_access_token: 'user' }).trusted, false);
  const noKey = loadAppsScript({ fetchResult: okResponse([{ id: SID, status: 'approved' }]) });
  assert.equal(noKey.ctx.submissionTrust_({ supabase_submission_id: SID, supabase_access_token: 'tok' }).trusted, false);
  const badId = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: okResponse([{ id: SID, status: 'approved' }]) });
  assert.equal(badId.ctx.submissionTrust_({ supabase_submission_id: `${SID}&or=(status.eq.pending)`, supabase_access_token: 'tok' }).trusted, false);
  assert.equal(badId.fetches.length, 0);
});

test('fix 5: an admin token + approved row id is bound to its payload and works only once', async () => {
  // The browser's hash (stored in the row) equals the Apps Script's hash of what it receives.
  const { subs } = loadSubmissions({ session: null, isAdmin: false });
  const payload = { intake_method: 'form', name: 'Café – “Salsa” 🎶', contact_name: 'Ralph', flyer_base64: 'AAA', flyers_extra: [{ base64: 'BBB', mime: 'image/png' }], skip: undefined };
  const browserHash = await subs.payloadHash(payload);
  const sent = JSON.parse(JSON.stringify({ ...payload, action: 'submit', supabase_submission_id: SID, supabase_access_token: 'admin-token-zz9' }));
  const rows = [{ id: SID, status: 'approved', payload_hash: browserHash, consumed_at: null }];
  const gs = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: fakeSupabase(rows) });
  assert.equal(gs.ctx.payloadHash_(sent), browserHash, 'browser and Apps Script hash the same content');

  const tampered = { ...sent, name: 'Different event' };
  assert.equal(gs.ctx.submissionTrust_(tampered).trusted, false, 'other content with the same id + token');
  assert.equal(rows[0].consumed_at, null, 'a mismatch does not consume the row');
  assert.equal(gs.ctx.submissionTrust_({ ...sent, supabase_access_token: 'someone-else' }).trusted, false, 'non-admin token');
  assert.equal(gs.ctx.submissionTrust_(sent).basis, 'supabase-admin', 'first use');
  assert.equal(rows[0].consumed_at, 'now');
  assert.equal(gs.ctx.submissionTrust_(sent).trusted, false, 'replay of the same request');

  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql').replace(/--[^\n]*/g, '');
  assert.match(sql, /payload_hash\s+text check \(payload_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /if old\.consumed_at is null and new\.consumed_at is not null then\s+new\.consumed_at := now\(\);\s+else\s+new\.consumed_at := old\.consumed_at;/);
  assert.match(sql, /new\.payload_hash := old\.payload_hash;/);
  assert.match(sql, /grant update \(status, review_note, consumed_at\) on table public\.submissions to authenticated/);
  assert.match(sql, /p_status = 'approved' and p_payload_hash is null then\s+raise/);
});

test('Apps Script: dashboard password stays a trust basis', () => {
  const { ctx } = loadAppsScript({ props: { DASHBOARD_PASSWORD: 'pw' }, fetchResult: okResponse([]) });
  assert.equal(ctx.submissionTrust_({ password: 'pw' }).basis, 'dashboard-auth');
  assert.equal(ctx.submissionTrust_({ password: 'nope' }).trusted, false);
});

test('proposed RLS migration: explicit grants, RPC-only writes, admin by uid allowlist approves and reads', () => {
  const files = readdirSync(new URL('supabase/migrations/', root)).filter(f => /_submissions_rls\.sql$/.test(f));
  assert.equal(files.length, 1);
  const sql = read(`supabase/migrations/${files[0]}`).replace(/--[^\n]*/g, '');
  assert.match(sql, /create table if not exists public\.submissions/);
  assert.match(sql, /alter table public\.submissions enable row level security/);
  assert.match(sql, /revoke all on table public\.submissions from public, anon, authenticated/);
  assert.match(sql, /grant select on table public\.submissions to authenticated/);
  assert.doesNotMatch(sql, /grant select[^;]*to anon/);
  assert.match(sql, /for select\s+to authenticated\s+using \(\(select submissions_private\.is_submissions_admin\(\)\)\)/);
  assert.match(sql, /p_status = 'approved' and not submissions_private\.is_submissions_admin\(\) then\s+raise/);
  assert.match(sql, /submitted_by_email := auth\.jwt\(\) ->> 'email'/);
  assert.doesNotMatch(sql, /contact_name[^\n]*(ralph|like|~)/i);
});

test('fix 2: admin = auth.uid() on a private allowlist, not email text', () => {
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql').replace(/--[^\n]*/g, '');
  assert.match(sql, /create table if not exists submissions_private\.submission_admins \(\s*user_id\s+uuid primary key references auth\.users \(id\) on delete cascade/);
  assert.match(sql, /exists \(select 1 from submissions_private\.submission_admins a where a\.user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /revoke all on table submissions_private\.submission_admins from public, anon, authenticated/);
  assert.doesNotMatch(sql, /ralphseanevans@gmail\.com/, 'no email in the SQL');
  assert.doesNotMatch(sql, /jwt\(\) ->> 'email'\)?\s*=/, 'email is never compared for trust');
  assert.match(read('SETUP.md'), /insert into submissions_private\.submission_admins/);
});

test('fix 3: pending inserts are throttled per caller hint and globally; details cap tightened', () => {
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql').replace(/--[^\n]*/g, '');
  assert.match(sql, /create trigger submissions_throttle\s+before insert on public\.submissions\s+for each row execute function submissions_private\.submissions_throttle\(\)/);
  assert.match(sql, /per_hint_max\s+constant int := 5;/);
  assert.match(sql, /global_max\s+constant int := 60;/);
  assert.match(sql, /using errcode = 'PT429'/);
  assert.match(sql, /if new\.status <> 'pending' then return new; end if;/);
  assert.match(sql, /sha256\(convert_to\(t\.salt \|\| '\|' \|\| ip, 'UTF8'\)\)/, 'IP stored only as a salted hash');
  assert.match(sql, /pg_column_size\(details\) <= 6144/);
  assert.doesNotMatch(sql, /turnstile|captcha/i);
  // The browser keeps details under that cap, even for multi-byte text.
  const { subs } = { subs: loadSubmissions({ session: null, isAdmin: false }).subs };
  const big = {}; for (const k of ['name', 'venue', 'organizer', 'cost', 'source_note', 'source_url', 'style_other', 'monthly_rule']) big[k] = '🎶'.repeat(2000);
  const row = subs.buildRow(big);
  assert.ok(Buffer.byteLength(JSON.stringify(row.details)) <= 5500);
});

test('fix 4: anon cannot execute the admin check, insert directly, or set the id', () => {
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql').replace(/--[^\n]*/g, '');
  assert.match(sql, /grant execute on function submissions_private\.is_submissions_admin\(\) to authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function [^;]*is_submissions_admin[^;]*anon/);
  assert.doesNotMatch(sql, /grant insert/i, 'no direct INSERT grant at all');
  assert.doesNotMatch(sql, /grant [^;]*\(\s*id\b/, 'id is never a granted column');
  assert.match(sql, /if tg_op = 'INSERT' then\s+new\.id := gen_random_uuid\(\);/);
  assert.match(sql, /grant execute on function public\.submit_submission\(uuid, text, text, jsonb\) to anon, authenticated;/);
  assert.match(sql, /function public\.submit_submission\([^)]*\)\s+returns jsonb\s+language sql\s+volatile\s+security invoker/);
  assert.match(sql, /return jsonb_build_object\('id', v_id, 'status', v_status\);\s*end;/);
});

test('A: throttle IP only from cf-connecting-ip, else the RIGHTMOST x-forwarded-for entry, else none (cited)', () => {
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql');
  const code = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /split_part\([^)]*x-forwarded-for/, 'never the leftmost (client-forgeable) entry');
  assert.match(code, /xff\s+text\[\] := string_to_array\(nullif\(btrim\(coalesce\(hdrs ->> 'x-forwarded-for', ''\)\), ''\), ','\);/);
  assert.match(code, /ip\s+text := coalesce\(nullif\(btrim\(hdrs ->> 'cf-connecting-ip'\), ''\),\s+nullif\(btrim\(xff\[cardinality\(xff\)\]\), ''\)\);/);
  assert.match(code, /new\.client_hint := null;\s+if ip is not null then/, 'no trustworthy header -> no per-sender hint');
  assert.doesNotMatch(code, /x-real-ip|true-client-ip/i);
  const setup = read('SETUP.md');
  for (const src of ['https://developers.cloudflare.com/fundamentals/reference/http-headers/', 'https://github.com/supabase/pg_graphql/issues/400']) {
    assert.ok(sql.includes(src) && setup.includes(src), `source cited: ${src}`);
  }
});

test('B: submission objects live in submissions_private; the existing private schema is never touched', () => {
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /(^|[^_a-z])private\./m, 'no private.<object> reference');
  assert.doesNotMatch(sql, /schema\s+private\b/i, 'no create/grant/revoke on schema private');
  assert.match(sql, /create schema if not exists submissions_private;/);
  for (const obj of ['submission_admins', 'submission_throttle']) assert.match(sql, new RegExp(`create table if not exists submissions_private\\.${obj} `));
  for (const fn of ['is_submissions_admin', 'submissions_throttle', 'submit_submission']) assert.match(sql, new RegExp(`create or replace function submissions_private\\.${fn}\\(`));
  // Least privilege on the new schema.
  const grants = [...sql.matchAll(/grant [^;]+;/g)].map(m => m[0].replace(/\s+/g, ' ')).filter(g => /submissions_private/.test(g));
  assert.deepEqual(grants.sort(), [
    'grant execute on function submissions_private.is_submissions_admin() to authenticated;',
    'grant execute on function submissions_private.submit_submission(uuid, text, text, jsonb) to anon, authenticated;',
    'grant usage on schema submissions_private to anon, authenticated;',
  ]);
  for (const t of ['submission_admins', 'submission_throttle']) assert.match(sql, new RegExp(`revoke all on table submissions_private\\.${t} from public, anon, authenticated;`));
  assert.match(sql, /revoke all on function submissions_private\.submissions_throttle\(\) from public, anon, authenticated;/);
});

function loadIntake(fetchResult) {
  const appended = [], fetches = [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ SUPABASE_PUBLISHABLE_KEY: 'pk', FLYERS_FOLDER_ID: 'f' })[k] ?? null }) },
    UrlFetchApp: { fetch: (u, o) => { fetches.push({ u, o }); return fetchResult(u, o); } },
    Utilities: {
      getUuid: () => 'row-1', base64Decode: () => [1, 2, 3], newBlob: (b, m, n) => ({ m, n }),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, str) => Array.from(createHash('sha256').update(str, 'utf8').digest(), b => (b > 127 ? b - 256 : b)),
    },
    DriveApp: { getFolderById: () => ({ createFile: () => ({ setSharing() {}, getUrl: () => 'u', getId: () => 'id' }) }), Access: {}, Permission: {} },
    SpreadsheetApp: {}, MailApp: { sendEmail() {} }, HtmlService: {}, ContentService: {}, Session: {}, LockService: {}, ScriptApp: { getService: () => ({ getUrl: () => 'x' }) },
  };
  vm.runInNewContext(read('tools/apps-script/Submission_AppsScript_Code.gs'), ctx);
  ctx.getSheet_ = () => ({});
  ctx.appendRow_ = (sh, row) => appended.push({ ...row });
  ctx.jsonOut_ = o => o;
  ctx.notifyFlyer_ = () => {}; ctx.notifyNewEvent_ = () => {};
  ctx.extractFlyerFields_ = () => null;
  for (const fn of Object.keys(ctx).filter(k => /^publish.*GitHub_$/.test(k))) ctx[fn] = () => ({ imagePath: 'p', patternAdded: '' });
  return { ctx, appended, fetches };
}

test('C: a post rejected by the contact or image-type check never consumes the one-time row', () => {
  const admin = { supabase_submission_id: SID, supabase_access_token: 'admin-token-zz9' };
  const cases = [
    [{ intake_method: 'form', name: 'Social', ...admin }, /contact method/],
    [{ intake_method: 'form', name: 'Social', contact_name: 'Sean', flyer_base64: 'AAA', flyer_mime: 'application/pdf', ...admin }, /JPG, PNG, GIF, or WebP/],
    [{ submission_kind: 'correction', event_key: 'k', flyer_base64: 'AAA', flyer_mime: 'text/html', ...admin }, /JPG, PNG, GIF, or WebP/],
  ];
  for (const [body, err] of cases) {
    const rows = [{ id: SID, status: 'approved', payload_hash: null, consumed_at: null }];
    const gs = loadIntake(fakeSupabase(rows));
    rows[0].payload_hash = gs.ctx.payloadHash_(body);
    const res = gs.ctx.handleSubmit_(JSON.parse(JSON.stringify(body)));
    assert.equal(res.ok, false);
    assert.match(res.error, err);
    assert.equal(gs.fetches.length, 0, 'no Supabase consume call for a rejected post');
    assert.equal(rows[0].consumed_at, null);
    // The corrected resubmission (same row, now valid) is still trusted once.
    const fixed = { ...body, contact_name: 'Sean', flyer_mime: 'image/png' };
    rows[0].payload_hash = gs.ctx.payloadHash_(fixed);
    const ok = gs.ctx.handleSubmit_(JSON.parse(JSON.stringify(fixed)));
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(gs.appended.at(-1).trust_basis, 'supabase-admin');
    assert.equal(rows[0].consumed_at, 'now');
  }
  const src = read('tools/apps-script/Submission_AppsScript_Code.gs');
  const body = src.slice(src.indexOf('function handleSubmit_('));
  const at = re => body.search(re);
  assert.ok(at(/const trust = submissionTrust_\(body\);/) > at(/at least one contact method is required/));
  assert.ok(at(/const trust = submissionTrust_\(body\);/) > at(/please upload a JPG, PNG, GIF, or WebP image/));
  assert.ok(at(/const trust = submissionTrust_\(body\);/) < at(/Utilities\.base64Decode\(body\.flyer_base64\)/));
});

test('SETUP.md recommends (but does not schedule) a 90-day cleanup of old rows / client_hint', () => {
  const setup = read('SETUP.md');
  assert.match(setup, /client_hint[^\n]*pseudonymous personal data|pseudonymous personal data[\s\S]{0,200}client_hint|client_hint` is a salted hash[\s\S]{0,120}pseudonymous personal data/);
  assert.match(setup, /90 days/);
  assert.match(setup, /delete from public\.submissions\s+where created_at < now\(\) - interval '90 days'/);
  assert.match(setup, /\*\*not scheduled and not\s+run by this PR\*\*/);
  const sql = read('supabase/migrations/20261022000000_submissions_rls.sql');
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /cron|delete from/i, 'nothing scheduled or run in the migration');
  assert.match(sql, /new\.client_hint := case when new\.client_hint is null then null else old\.client_hint end;/);
});

test('pages load submissions.js after auth.js, with content cache busters', () => {
  const sub = read('dance-event-viewer/submit-event.html');
  const idx = read('dance-event-viewer/index.html');
  const v = f => sha8(`dance-event-viewer/${f}`);
  for (const html of [sub, idx]) {
    assert.match(html, new RegExp(`js/auth\\.js\\?v=${v('js/auth.js')}"></script>\\s*<script[^>]*js/submissions\\.js\\?v=${v('js/submissions.js')}`));
  }
  assert.match(sub, new RegExp(`js/submit-event\\.js\\?v=${v('js/submit-event.js')}`));
  assert.match(sub, new RegExp(`css/submit-event\\.css\\?v=${v('css/submit-event.css')}`));
  assert.match(idx, new RegExp(`js/app\\.js\\?v=${v('js/app.js')}`));
  assert.match(sub, /id="review-list"[^>]*data-admin-only/);
});

test('public docs no longer name trigger words', () => {
  const readme = read('dance-event-viewer/README.md');
  assert.doesNotMatch(readme, /name contains|"Ralph"|admin123/i);
});
