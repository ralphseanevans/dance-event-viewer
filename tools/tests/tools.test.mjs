// Tests for the build tools. Run from the repo root:  node --test tools/tests/
// Everything runs in temp dirs with fixtures or a mocked fetch. No network, no Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareMasterTransition, copyAndVerifyBackup, exportPublic, load, save, validateDance, PUBLIC_FIELDS } from '../lib.mjs';
import { exportEvents, readConfig } from '../export_supabase_public.mjs';
import { checkSite } from '../check_site.mjs';

const TOOLS = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO = resolve(TOOLS, '..');
const tmp = () => mkdtempSync(join(tmpdir(), 'dev-tools-test-'));

function masterEvent(n, extra = {}) {
  return {
    key: `fixture-${String(n).padStart(3, '0')}`, name: `Fixture ${n}`, style: 'West Coast Swing', type: 'one_time',
    day_of_week: null, monthly_rule: null, start_date: '2026-08-15', end_date: null, start_time: '19:00', end_time: '21:00',
    venue: 'Fixture Hall, Pensacola, FL', state: 'FL', cost: '$10', notes: 'Fixture only', source_skill: 'fixture',
    source_type: 'manual', source_detail: 'regression fixture', first_seen: '2026-08-03', last_confirmed: '2026-08-03',
    added_to_calendar: false, calendar_event_id: null, in_wcs_list: n % 2 === 0, ...extra,
  };
}
const master = (events) => ({ _schema_notes: 'fixture master', skill_runs: {}, events });

// ---- lib.mjs (ported from Operations/Tests/integrity_gate_tests.mjs) ----
test('strict load: accepts valid JSON, rejects NUL bytes and truncation', () => {
  const dir = tmp();
  try {
    const ok = join(dir, 'ok.json'); save(ok, master([masterEvent(1)]));
    assert.equal(load(ok).events.length, 1);
    const nul = join(dir, 'nul.json'); writeFileSync(nul, '{"events":[]}\0');
    assert.throws(() => load(nul), /NUL byte/);
    const cut = join(dir, 'cut.json'); writeFileSync(cut, '{"events":[');
    assert.throws(() => load(cut), /Malformed or truncated JSON/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('schema rejects missing and unknown fields; in_wcs_list stays required', () => {
  const doc = master([masterEvent(1), masterEvent(2)]);
  delete doc.events[0].venue; doc.events[1].invented_private_field = true;
  const errors = validateDance(doc).join('\n');
  assert.match(errors, /missing required field venue/);
  assert.match(errors, /unknown field invented_private_field/);
  const noWcs = master([masterEvent(1)]); delete noWcs.events[0].in_wcs_list;
  assert.ok(validateDance(noWcs).length);
});

test('transition analysis and verified backup', () => {
  const before = master([masterEvent(1), masterEvent(2)]);
  const after = structuredClone(before); after.events.shift(); after.events[0].cost = '$12'; after.events.push(masterEvent(3));
  assert.deepEqual(Object.values(compareMasterTransition(before, after)).map(a => a.length), [1, 1, 1]);
  const dir = tmp();
  try {
    const src = join(dir, 'm.json'); save(src, before);
    const dst = join(dir, 'b.json'); copyAndVerifyBackup(src, dst, validateDance);
    assert.ok(readFileSync(src).equals(readFileSync(dst)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cancel fields validate', () => {
  const good = master([
    masterEvent(1, { cancel_status: 'owner' }),
    masterEvent(2, { canceled_dates: [{ date: '2026-10-11', cancel_status: 'confirmed', reason: 'weather' }] }),
  ]);
  assert.deepEqual(validateDance(good), []);
  const bad = master([
    masterEvent(1, { cancel_status: 'maybe' }),
    masterEvent(2, { canceled_dates: [{ date: 'Oct 11' }] }),
    masterEvent(3, { canceled_dates: { date: '2026-10-11' } }),
  ]);
  const errors = validateDance(bad).join('\n');
  assert.match(errors, /bad cancel_status maybe/);
  assert.match(errors, /need a YYYY-MM-DD date/);
  assert.match(errors, /canceled_dates must be an array/);
});

test('exportPublic: 18 fields, cancel fields only when set, no internal fields', () => {
  const out = exportPublic(master([
    masterEvent(1),
    masterEvent(2, { canceled_dates: [{ date: '2026-10-11', cancel_status: 'confirmed', reason: 'weather' }] }),
    masterEvent(3, { cancel_status: 'likely', canceled_dates: [] }),
  ]));
  assert.deepEqual(Object.keys(out.events[0]).sort(), [...PUBLIC_FIELDS].sort());
  assert.equal(out.events[1].canceled_dates[0].date, '2026-10-11');
  assert.equal(out.events[2].cancel_status, 'likely');
  assert.ok(!('canceled_dates' in out.events[2]));
  for (const event of out.events) for (const field of ['notes', 'in_wcs_list', 'source_detail']) assert.ok(!(field in event));
});

test('export_public.mjs CLI writes a sanitized file', () => {
  const dir = tmp();
  try {
    const src = join(dir, 'master.json'); save(src, master([masterEvent(1, { cancel_status: 'owner' })]));
    const out = join(dir, 'out', 'public.json'); mkdirSync(join(dir, 'out'));
    execFileSync(process.execPath, [join(TOOLS, 'export_public.mjs'), src, out], { stdio: 'pipe' });
    const ev = JSON.parse(readFileSync(out, 'utf8')).events[0];
    assert.equal(ev.cancel_status, 'owner'); assert.ok(!('notes' in ev));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- export_supabase_public.mjs (mocked fetch) ----
const publicRow = (key, extra = {}) => ({ ...Object.fromEntries(PUBLIC_FIELDS.map(f => [f, null])), key, name: key, ...extra });
const config = { url: 'https://db.test', publishableKey: 'sb_publishable_test', table: 'event_listings' };

test('reads the real viewer config', () => {
  const cfg = readConfig(readFileSync(join(REPO, 'dance-event-viewer/js/supabase-config.js'), 'utf8'));
  assert.equal(cfg.table, 'event_listings');
  assert.match(cfg.publishableKey, /^sb_publishable_/);
});

test('Supabase export: GET only, asks for cancel fields, keeps them only when set', async () => {
  const seen = [];
  const fetcher = async (url, opts) => {
    seen.push({ url, opts });
    return Response.json([
      publicRow('a', { canceled_dates: null, cancel_status: null }),
      publicRow('b', { canceled_dates: [{ date: '2026-10-11', cancel_status: 'confirmed' }], cancel_status: null }),
    ]);
  };
  const events = await exportEvents(config, fetcher);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].opts.method, 'GET');
  assert.match(seen[0].url, /select=[^&]*canceled_dates,cancel_status/);
  assert.ok(!('canceled_dates' in events[0]) && !('cancel_status' in events[0]));
  assert.equal(events[1].canceled_dates[0].cancel_status, 'confirmed');
});

test('Supabase export: falls back to 18 fields on HTTP 400', async () => {
  const urls = [];
  const fetcher = async (url) => { urls.push(url); return urls.length === 1 ? new Response('no column', { status: 400 }) : Response.json([publicRow('a')]); };
  const events = await exportEvents(config, fetcher);
  assert.equal(urls.length, 2);
  assert.doesNotMatch(urls[1], /cancel/);
  assert.equal(events.length, 1);
});

test('Supabase export: refuses empty, duplicate, unexpected fields, bad cancel data, and paginates', async () => {
  await assert.rejects(exportEvents(config, async () => Response.json([])), /empty/);
  await assert.rejects(exportEvents(config, async () => Response.json([publicRow('a'), publicRow('a')])), /duplicate/);
  await assert.rejects(exportEvents(config, async () => Response.json([publicRow('a', { notes: 'x' })])), /Unexpected public field notes/);
  await assert.rejects(exportEvents(config, async () => Response.json([publicRow('a', { cancel_status: 'maybe' })])), /bad cancel_status/);
  let n = 0;
  const big = await exportEvents(config, async () => Response.json(n++ === 0 ? Array.from({ length: 500 }, (_, i) => publicRow(`k${i}`)) : [publicRow('last')]));
  assert.equal(big.length, 501);
});

// ---- build_share_pages.mjs (fixture root, temp output) ----
test('share pages: writes only to --out and marks cancellations', () => {
  const root = tmp(); const out = tmp();
  try {
    mkdirSync(join(root, 'dance-event-viewer'));
    writeFileSync(join(root, 'dance-event-viewer', 'logo-map.json'), JSON.stringify({ logos: {}, patterns: [] }));
    const weekly = { ...publicRow('weekly-friday'), name: 'Weekly Friday', style: 'West Coast Swing', type: 'weekly_recurring', day_of_week: 'Friday', start_time: '19:00', end_time: '21:00', venue: 'Hall, Pensacola, FL', state: 'FL',
      canceled_dates: [{ date: '2026-10-09', cancel_status: 'likely', reason: 'weather' }] };
    const oneOff = { ...publicRow('one-off'), name: 'One Off', style: 'Latin', type: 'one_time', start_date: '2026-11-01', venue: 'Club, Mobile, AL', state: 'AL', cancel_status: 'owner' };
    const normal = { ...publicRow('normal'), name: 'Normal', style: 'Latin', type: 'one_time', start_date: '2026-11-02', venue: 'Club, Mobile, AL', state: 'AL' };
    writeFileSync(join(root, 'dance_events.json'), JSON.stringify({ events: [weekly, oneOff, normal] }));
    execFileSync(process.execPath, [join(TOOLS, 'build_share_pages.mjs'), '--root', root, '--out', out],
      { stdio: 'pipe', env: { ...process.env, SHARE_PAGES_TODAY: '2026-10-08' } });
    assert.ok(!existsSync(join(root, 'e')) && !existsSync(join(root, 'sitemap.xml')), 'root must stay untouched');
    assert.deepEqual(readdirSync(join(out, 'e')).sort(), ['normal.html', 'one-off.html', 'weekly-friday.html']);
    const weeklyHtml = readFileSync(join(out, 'e', 'weekly-friday.html'), 'utf8');
    assert.match(weeklyHtml, /flyer-frame is-canceled cancel-banner--likely/);
    assert.match(weeklyHtml, /EventCancelled/);
    assert.match(weeklyHtml, /\/dance-event-viewer\/css\/cancel-banner\.css/);
    const ownerHtml = readFileSync(join(out, 'e', 'one-off.html'), 'utf8');
    assert.match(ownerHtml, /cancel-banner--owner/);
    assert.match(ownerHtml, /Canceled by owner\./);
    const normalHtml = readFileSync(join(out, 'e', 'normal.html'), 'utf8');
    assert.doesNotMatch(normalHtml, /is-canceled|EventCancelled|cancel-banner\.css/);
    assert.match(normalHtml, /EventScheduled/);
    assert.equal((readFileSync(join(out, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length, 4);
    // After the canceled Friday, the next Friday is a normal occurrence again.
    execFileSync(process.execPath, [join(TOOLS, 'build_share_pages.mjs'), '--root', root, '--out', out],
      { stdio: 'pipe', env: { ...process.env, SHARE_PAGES_TODAY: '2026-10-10' } });
    assert.doesNotMatch(readFileSync(join(out, 'e', 'weekly-friday.html'), 'utf8'), /is-canceled|EventCancelled/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
});

// ---- check_site.mjs (offline fixtures) ----
test('site checker accepts valid robots, sitemap, event links, images, and JSON-LD', async () => {
  const root = tmp();
  try {
    mkdirSync(join(root, 'e'));
    mkdirSync(join(root, 'dance-event-viewer', 'assets'), { recursive: true });
    writeFileSync(join(root, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://danceeventviewer.net/sitemap.xml\n');
    writeFileSync(join(root, 'sitemap.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://danceeventviewer.net/e/fixture.html</loc></url></urlset>');
    writeFileSync(join(root, 'e', 'fixture.html'), '<!doctype html><script type="application/ld+json">{"@type":"Event"}</script><a href="/dance-event-viewer/">Calendar</a><img src="/dance-event-viewer/assets/flyer.jpg" alt="Fixture Dance flyer">');
    writeFileSync(join(root, 'dance-event-viewer', 'index.html'), '<html></html>');
    writeFileSync(join(root, 'dance-event-viewer', 'assets', 'flyer.jpg'), 'fixture');
    const result = await checkSite(root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.sitemapUrls, 1);
    assert.equal(result.eventPages, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('site checker reports missing local assets, missing alt, invalid JSON-LD, and robots issues', async () => {
  const root = tmp();
  try {
    mkdirSync(join(root, 'e'));
    writeFileSync(join(root, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    writeFileSync(join(root, 'sitemap.xml'), '<urlset><url><loc>https://danceeventviewer.net/e/bad.html</loc></url><oops></urlset>');
    writeFileSync(join(root, 'e', 'bad.html'), '<script type="application/ld+json">{oops}</script><a href="missing.html">x</a><img src="flyer.jpg">');
    const result = await checkSite(root);
    const errors = result.errors.join('\n');
    assert.match(errors, /robots.txt: does not allow/);
    assert.match(errors, /mismatched closing tag/);
    assert.match(errors, /missing\.html has no local file/);
    assert.match(errors, /img 1 is missing alt/);
    assert.match(errors, /invalid JSON-LD/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('site checker live mode uses HEAD and flags non-200 responses', async () => {
  const root = tmp();
  try {
    mkdirSync(join(root, 'e'));
    writeFileSync(join(root, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://danceeventviewer.net/sitemap.xml');
    writeFileSync(join(root, 'sitemap.xml'), '<urlset><url><loc>https://danceeventviewer.net/e/live.html</loc></url></urlset>');
    writeFileSync(join(root, 'e', 'live.html'), '<html></html>');
    const calls = [];
    const result = await checkSite(root, { live: true, fetcher: async (url, options) => { calls.push({ url, options }); return new Response(null, { status: 404 }); } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'HEAD');
    assert.match(result.errors.join('\n'), /returned HTTP 404/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
