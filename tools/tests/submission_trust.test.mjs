// Submission trust: a typed name grants nothing; only Supabase RLS (admin Google account)
// can approve. Admin sign-in redirects back to the current origin (localhost works).
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

function loadSubmissions({ session, isAdmin, failApproved = false }) {
  const inserts = [];
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    from: (table) => ({
      insert: (row) => {
        inserts.push({ table, row });
        if (failApproved && row.status === 'approved') return Promise.resolve({ error: { message: 'new row violates row-level security policy' } });
        return Promise.resolve({ error: null });
      },
    }),
  };
  const window = { DEV_AUTH: { client, isAdmin: () => isAdmin }, crypto: { randomUUID: () => SID } };
  vm.runInNewContext(read('dance-event-viewer/js/submissions.js'), { window });
  return { subs: window.DEV_SUBMISSIONS, inserts };
}

test('anonymous submissions (even named "Ralph") are filed as pending with no token', async () => {
  const { subs, inserts } = loadSubmissions({ session: null, isAdmin: false });
  const payload = { intake_method: 'form', contact_name: 'Ralph', name: 'Social', flyer_base64: 'AAA' };
  const rec = await subs.attach(payload);
  assert.equal(rec.status, 'pending');
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, 'submissions');
  assert.equal(inserts[0].row.status, 'pending');
  assert.equal(inserts[0].row.flyer_count, 1);
  assert.equal('flyer_base64' in inserts[0].row, false, 'images never go to Supabase');
  assert.equal(payload.supabase_submission_id, SID);
  assert.equal('supabase_access_token' in payload, false);
});

test('admin session asks for approved and forwards its token; RLS refusal falls back to pending', async () => {
  const session = { access_token: 'test-access-token', user: { email: 'ralphseanevans@gmail.com' } };
  const ok = loadSubmissions({ session, isAdmin: true });
  const p1 = { intake_method: 'flyer' };
  assert.equal((await ok.subs.attach(p1)).status, 'approved');
  assert.equal(p1.supabase_access_token, 'test-access-token');

  const refused = loadSubmissions({ session, isAdmin: true, failApproved: true });
  const p2 = { intake_method: 'flyer' };
  assert.equal((await refused.subs.attach(p2)).status, 'pending');
  assert.deepEqual(refused.inserts.map(i => i.row.status), ['approved', 'pending']);
  assert.equal('supabase_access_token' in p2, false);
});

function loadAppsScript({ props = {}, fetchResult }) {
  const fetches = [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    UrlFetchApp: { fetch: (url, opts) => { fetches.push({ url, opts }); return fetchResult(url, opts); } },
    Utilities: {}, SpreadsheetApp: {}, DriveApp: {}, MailApp: {}, HtmlService: {}, ContentService: {}, Session: {}, LockService: {}, ScriptApp: {},
  };
  vm.runInNewContext(read('tools/apps-script/Submission_AppsScript_Code.gs'), ctx);
  return { ctx, fetches };
}
const okResponse = (rows, code = 200) => () => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(rows) });

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

test('Apps Script: trust only when the caller\'s own token can read an approved row (RLS)', () => {
  const approved = loadAppsScript({ props: { SUPABASE_PUBLISHABLE_KEY: 'pk' }, fetchResult: okResponse([{ id: SID, status: 'approved' }]) });
  const t = approved.ctx.submissionTrust_({ supabase_submission_id: SID, supabase_access_token: 'fake-test-token-zz9', contact_name: 'anyone' });
  assert.equal(t.trusted, true);
  assert.equal(t.basis, 'supabase-admin');
  const f = approved.fetches[0];
  assert.match(f.url, /^https:\/\/xyyxbwetagfexsqtokpk\.supabase\.co\/rest\/v1\/submissions\?select=id,status&status=eq\.approved&id=eq\./);
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

test('Apps Script: dashboard password stays a trust basis', () => {
  const { ctx } = loadAppsScript({ props: { DASHBOARD_PASSWORD: 'pw' }, fetchResult: okResponse([]) });
  assert.equal(ctx.submissionTrust_({ password: 'pw' }).basis, 'dashboard-auth');
  assert.equal(ctx.submissionTrust_({ password: 'nope' }).trusted, false);
});

test('proposed RLS migration: explicit grants, anon pending-only, admin email approves and reads', () => {
  const files = readdirSync(new URL('supabase/migrations/', root)).filter(f => /_submissions_rls\.sql$/.test(f));
  assert.equal(files.length, 1);
  const sql = read(`supabase/migrations/${files[0]}`).replace(/--[^\n]*/g, '');
  assert.match(sql, /create table if not exists public\.submissions/);
  assert.match(sql, /alter table public\.submissions enable row level security/);
  assert.match(sql, /revoke all on table public\.submissions from public, anon, authenticated/);
  assert.match(sql, /grant insert \([^)]*\)\s+on table public\.submissions to anon, authenticated/);
  assert.match(sql, /grant select on table public\.submissions to authenticated/);
  assert.doesNotMatch(sql, /grant select[^;]*to anon/);
  assert.match(sql, /for insert\s+to anon, authenticated\s+with check \(status = 'pending'\)/);
  assert.match(sql, /for insert\s+to authenticated\s+with check \(status = 'approved' and public\.is_submissions_admin\(\)\)/);
  assert.match(sql, /for select\s+to authenticated\s+using \(public\.is_submissions_admin\(\)\)/);
  assert.match(sql, /array\['ralphseanevans@gmail\.com'\]/);
  assert.match(sql, /submitted_by_email := auth\.jwt\(\) ->> 'email'/);
  assert.doesNotMatch(sql, /contact_name[^\n]*(ralph|like|~)/i);
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
