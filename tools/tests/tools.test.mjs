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
    execFileSync(process.execPath, [join(TOOLS, 'export_public.mjs'), src, out], { stdio: 'ignore' });
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
function withSharePages(events, check, { viewer, logos = {}, composed = [], today = '2026-10-08' } = {}) {
  const root = tmp(); const out = tmp();
  try {
    mkdirSync(join(root, 'dance-event-viewer'));
    writeFileSync(join(root, 'dance-event-viewer', 'logo-map.json'), JSON.stringify({ logos, patterns: [] }));
    writeFileSync(join(root, 'dance_events.json'), JSON.stringify({ events }));
    if (viewer !== undefined) writeFileSync(join(root, 'dance-event-viewer', 'index.html'), viewer);
    if (composed.length) {
      mkdirSync(join(root, 'e', 'img'), { recursive: true });
      for (const key of composed) writeFileSync(join(root, 'e', 'img', `${key}.jpg`), 'fixture image');
    }
    execFileSync(process.execPath, [join(TOOLS, 'build_share_pages.mjs'), '--root', root, '--out', out],
      { stdio: 'ignore', env: { ...process.env, SHARE_PAGES_TODAY: today, TZ: 'UTC' } });
    check({ root, out, page: key => readFileSync(join(out, 'e', `${key}.html`), 'utf8'),
      sitemap: readFileSync(join(out, 'sitemap.xml'), 'utf8') });
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
}
const shareEvent = (key, extra = {}) => ({ ...publicRow(key), name: key, style: 'West Coast Swing',
  type: 'one_time', start_date: '2026-10-15', ...extra });
const jsonLd = html => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
const meta = (html, attribute, name) => new RegExp(`<meta ${attribute}="${name}" content="([^"]*)">`).exec(html)[1];

test('share sitemap: verified lastmod only; passed pages remain archived but are excluded', () => {
  const events = [
    shareEvent('verified', { verified_on: '2026-09-02', state: 'PA' }),
    shareEvent('unverified'),
    shareEvent('invalid-verification', { verified_on: 'unknown' }),
    shareEvent('past-one', { start_date: '2026-10-06', end_date: '2026-10-07', state: 'PA' }),
    shareEvent('past-tentative', { type: 'tentative', start_date: '2026-10-07' }),
    shareEvent('ended-weekly', { type: 'weekly_recurring', day_of_week: 'Friday', start_date: null, end_date: '2026-10-07' }),
    shareEvent('ended-monthly', { type: 'monthly_recurring', monthly_rule: 'First Friday', start_date: null, end_date: '2026-09-30' }),
    shareEvent('ongoing', { start_date: '2026-10-07', end_date: '2026-10-09' }),
    shareEvent('today', { start_date: '2026-10-08' }),
    shareEvent('future-series', { type: 'weekly_recurring', day_of_week: 'Friday', start_date: '2026-11-01' }),
  ];
  withSharePages(events, ({ sitemap, page }) => {
    const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
    assert.equal(entries.length, 7);
    assert.doesNotMatch(entries[0], /lastmod/);
    assert.match(entries.find(e => e.includes('/e/verified.html')), /<lastmod>2026-09-02<\/lastmod>/);
    assert.equal((sitemap.match(/<lastmod>/g) || []).length, 1);
    assert.doesNotMatch(sitemap, /past-one|past-tentative|ended-weekly|ended-monthly/);
    for (const key of ['past-one', 'past-tentative', 'ended-weekly', 'ended-monthly']) {
      const html = page(key);
      assert.match(html, /This event has passed/);
      assert.match(html, /Upcoming dances nearby/);
      const related = html.split('<section class="related">')[1];
      assert.doesNotMatch(related, /href="\/e\/(?:past-one|past-tentative|ended-weekly|ended-monthly)\.html/);
    }
    const nearby = page('past-one').split('<section class="related">')[1];
    assert.ok(nearby.indexOf('/e/verified.html') < nearby.indexOf('/e/ongoing.html'), 'same state precedes same style');
    assert.equal(jsonLd(page('past-one')).startDate, '2026-10-06');
    assert.equal(jsonLd(page('past-tentative')).startDate, '2026-10-07');
    assert.doesNotMatch(page('ended-weekly'), /application\/ld\+json/);
    assert.doesNotMatch(page('ended-monthly'), /application\/ld\+json/);
    assert.doesNotMatch(page('today'), /This event has passed/);
    assert.doesNotMatch(page('ongoing'), /This event has passed/);
    assert.equal(jsonLd(page('future-series')).startDate, '2026-11-06');
  });
});

test('share metadata: PostalAddress parsing, conservative fallback and state deduplication', () => {
  withSharePages([
    shareEvent('street', { venue: 'Fixture Hall, 123 Main St, Pittsburgh, PA 15222', state: 'PA', cost: '$12' }),
    shareEvent('city-only', { venue: 'Fixture Hall, Pittsburgh, PA, PA', state: 'PA' }),
    shareEvent('uncertain', { venue: 'Fixture Hall - near Pittsburgh', state: 'PA' }),
    shareEvent('no-state', { venue: 'Fixture Hall' }),
  ], ({ page }) => {
    const street = jsonLd(page('street'));
    assert.deepEqual(street.location, { '@type': 'Place', name: 'Fixture Hall', address: {
      '@type': 'PostalAddress', streetAddress: '123 Main St', addressLocality: 'Pittsburgh',
      addressRegion: 'PA', postalCode: '15222', addressCountry: 'US',
    } });
    assert.equal(street.description, 'West Coast Swing dance in Pittsburgh, PA: Thu, Oct 15, 2026. Fixture Hall. $12.');
    const city = page('city-only');
    assert.doesNotMatch(city, /PA, PA/);
    assert.match(city, /<strong>Where:<\/strong> Fixture Hall, Pittsburgh, PA<\/p>/);
    assert.deepEqual(jsonLd(city).location.address, { '@type': 'PostalAddress', addressLocality: 'Pittsburgh', addressRegion: 'PA', addressCountry: 'US' });
    const uncertain = jsonLd(page('uncertain')).location;
    assert.equal(uncertain.name, 'Fixture Hall - near Pittsburgh');
    assert.deepEqual(uncertain.address, { '@type': 'PostalAddress', addressRegion: 'PA', addressCountry: 'US' });
    assert.deepEqual(jsonLd(page('no-state')).location.address, { '@type': 'PostalAddress', addressCountry: 'US' });
  });
});

test('share JSON-LD: DST offsets for each date, fixed AZ, split-zone omission and date-only dates', () => {
  const skipped = ['FL', 'TN', 'KY', 'IN', 'MI', 'TX', 'KS', 'NE', 'ND', 'SD', 'OR', 'ID', 'AK', 'NV'];
  const events = [
    shareEvent('summer', { state: 'PA', start_date: '2026-07-15', start_time: '19:00', end_time: '21:00' }),
    shareEvent('winter', { state: 'AL', start_date: '2026-12-15', start_time: '19:00' }),
    shareEvent('cross-dst', { state: 'PA', start_date: '2026-10-31', end_date: '2026-11-01', start_time: '19:00', end_time: '19:00' }),
    shareEvent('spring', { state: 'CO', start_date: '2026-03-08', start_time: '00:30', end_time: '19:00' }),
    shareEvent('az', { state: 'AZ', start_date: '2026-07-15', start_time: '19:00' }),
    shareEvent('date-only', { state: 'PA', end_date: '2026-10-16' }),
    ...skipped.map(state => shareEvent(state, { state, start_time: '19:00', end_time: '21:00' })),
  ];
  withSharePages(events, ({ page }) => {
    assert.equal(jsonLd(page('summer')).startDate, '2026-07-15T19:00:00-04:00');
    assert.equal(jsonLd(page('summer')).endDate, '2026-07-15T21:00:00-04:00');
    assert.equal(jsonLd(page('winter')).startDate, '2026-12-15T19:00:00-06:00');
    assert.equal(jsonLd(page('cross-dst')).startDate, '2026-10-31T19:00:00-04:00');
    assert.equal(jsonLd(page('cross-dst')).endDate, '2026-11-01T19:00:00-05:00');
    assert.equal(jsonLd(page('spring')).startDate, '2026-03-08T00:30:00-07:00');
    assert.equal(jsonLd(page('spring')).endDate, '2026-03-08T19:00:00-06:00');
    assert.equal(jsonLd(page('az')).startDate, '2026-07-15T19:00:00-07:00');
    assert.equal(jsonLd(page('date-only')).startDate, '2026-10-15');
    assert.equal(jsonLd(page('date-only')).endDate, '2026-10-16');
    for (const state of skipped) {
      assert.equal(jsonLd(page(state)).startDate, '2026-10-15T19:00:00');
      assert.equal(jsonLd(page(state)).endDate, '2026-10-15T21:00:00');
    }
  });
});

test('share OG: whole-word description limit, absolute matching flyer images, alt and offers', () => {
  const longCost = '$10 for admission plus ' + 'optional workshop details '.repeat(20);
  withSharePages([
    shareEvent('composed', { name: 'Fixture & Friends', venue: 'Hall, Pittsburgh, PA', state: 'PA', cost: longCost, source_url: 'https://example.test/organizer' }),
    shareEvent('logo', { cost: 'Free admission' }),
    shareEvent('absolute-logo', { cost: '18+; 20% discount' }),
    shareEvent('fallback', { cost: 'Donation requested' }),
  ], ({ page }) => {
    const html = page('composed');
    const ld = jsonLd(html);
    assert.ok(ld.description.length <= 155);
    const full = 'West Coast Swing dance in Pittsburgh, PA: Thu, Oct 15, 2026. Hall. ' + longCost + '.';
    assert.ok(full.startsWith(ld.description));
    assert.equal(full[ld.description.length], ' ', 'description ends at a word boundary');
    assert.equal(meta(html, 'name', 'description'), ld.description);
    assert.equal(meta(html, 'property', 'og:description'), ld.description);
    assert.equal(meta(html, 'property', 'og:title'), 'Fixture &amp; Friends — Dance Event Viewer');
    assert.equal(meta(html, 'property', 'og:url'), ld.url);
    assert.equal(meta(html, 'property', 'og:image:alt'), 'Fixture &amp; Friends flyer');
    assert.equal(ld.offers.price, '10');
    assert.ok(!('organizer' in ld));
    const images = {
      composed: 'https://danceeventviewer.net/e/img/composed.jpg',
      logo: 'https://danceeventviewer.net/graphics/logos/fixture.jpg',
      'absolute-logo': 'https://example.test/flyer.jpg',
      fallback: 'https://danceeventviewer.net/dance-event-viewer/assets/og-card.png',
    };
    for (const [key, image] of Object.entries(images)) {
      assert.deepEqual(jsonLd(page(key)).image, [image]);
      assert.equal(meta(page(key), 'property', 'og:image'), image);
    }
    assert.equal(jsonLd(page('logo')).offers.price, '0');
    assert.ok(!('offers' in jsonLd(page('absolute-logo'))));
    assert.ok(!('offers' in jsonLd(page('fallback'))));
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
    assert.match(html, /G-HC9F04RL9D/);
  }, { logos: { logo: ['../graphics/logos/fixture.jpg'], 'absolute-logo': 'https://example.test/flyer.jpg' }, composed: ['composed'] });
});

test('share viewer: replace only marked block in --out, cap 60, sort upcoming dates and group states', () => {
  const viewer = '<!DOCTYPE html><html lang="en"><head><title>Fixture</title></head><body><main><div id="results"></div>\n<!-- upcoming-events:start -->old links<!-- upcoming-events:end -->\n</main><footer>Keep footer</footer></body></html>';
  const events = Array.from({ length: 65 }, (_, i) => shareEvent(`up-${i}`, {
    name: `Dance & ${i}`, start_date: `2026-11-${String(i % 20 + 1).padStart(2, '0')}`, state: i % 2 ? 'PA' : 'AL',
  })).reverse();
  events.push(shareEvent('past', { start_date: '2026-10-07' }), shareEvent('undated', { start_date: null }));
  withSharePages(events, ({ root, out }) => {
    assert.equal(readFileSync(join(root, 'dance-event-viewer', 'index.html'), 'utf8'), viewer);
    const html = readFileSync(join(out, 'dance-event-viewer', 'index.html'), 'utf8');
    const marker = /<!-- upcoming-events:start -->[\s\S]*?<!-- upcoming-events:end -->/;
    assert.equal(html.replace(marker, ''), viewer.replace(marker, ''));
    assert.doesNotMatch(html, /old links|\/e\/past\.html|\/e\/undated\.html/);
    assert.match(html, /<h2[^>]*>Upcoming dance events<\/h2>/);
    assert.equal((html.match(/<a href="\/e\//g) || []).length, 60);
    const groups = [...html.matchAll(/<h3>(.*?)<\/h3>\s*<ul>([\s\S]*?)<\/ul>/g)];
    assert.equal(groups.length, 2);
    const links = [];
    for (const [, state, list] of groups) {
      const dates = [...list.matchAll(/ — (\d{4}-\d{2}-\d{2})/g)].map(m => m[1]);
      assert.deepEqual(dates, [...dates].sort());
      for (const [, key] of list.matchAll(/href="\/e\/(.*?)\.html"/g)) {
        assert.equal(events.find(e => e.key === key).state, state);
        links.push(key);
      }
    }
    const expected = events.filter(e => e.start_date >= '2026-10-08').sort((a, b) =>
      a.start_date.localeCompare(b.start_date) || a.key.localeCompare(b.key)).slice(0, 60).map(e => e.key);
    assert.deepEqual(links.sort(), expected.sort());
    assert.match(html, /Dance &amp;/);
  }, { viewer });
  for (const unmarked of ['<main>Keep this viewer</main>', '<main><!-- upcoming-events:start -->Only one marker</main>']) {
    withSharePages([], ({ out, root }) => {
      assert.ok(!existsSync(join(out, 'dance-event-viewer', 'index.html')));
      assert.equal(readFileSync(join(root, 'dance-event-viewer', 'index.html'), 'utf8'), unmarked);
    }, { viewer: unmarked });
  }
});

test('share pages: writes only to --out and marks cancellations', () => {
  const root = tmp(); const out = tmp();
  try {
    mkdirSync(join(root, 'dance-event-viewer'));
    writeFileSync(join(root, 'dance-event-viewer', 'logo-map.json'), JSON.stringify({ logos: {}, patterns: [] }));
    const weekly = { ...publicRow('weekly-friday'), name: 'Weekly Friday', style: 'West Coast Swing', type: 'weekly_recurring', day_of_week: 'Friday', start_time: '19:00', end_time: '21:00', venue: 'Hall, Pensacola, FL', state: 'FL',
      canceled_dates: [{ date: '2026-10-09', cancel_status: 'likely', reason: 'Storm <break> & rest' }] };
    const oneOff = { ...publicRow('one-off'), name: 'One Off', style: 'Latin', type: 'one_time', start_date: '2026-11-01', venue: 'Club, Mobile, AL', state: 'AL', cancel_status: 'owner' };
    const normal = { ...publicRow('normal'), name: 'Normal', style: 'Latin', type: 'one_time', start_date: '2026-11-02', venue: 'Club, Mobile, AL', state: 'AL' };
    writeFileSync(join(root, 'dance_events.json'), JSON.stringify({ events: [weekly, oneOff, normal] }));
    execFileSync(process.execPath, [join(TOOLS, 'build_share_pages.mjs'), '--root', root, '--out', out],
      { stdio: 'ignore', env: { ...process.env, SHARE_PAGES_TODAY: '2026-10-08' } });
    assert.ok(!existsSync(join(root, 'e')) && !existsSync(join(root, 'sitemap.xml')), 'root must stay untouched');
    assert.deepEqual(readdirSync(join(out, 'e')).sort(), ['normal.html', 'one-off.html', 'weekly-friday.html']);
    const weeklyHtml = readFileSync(join(out, 'e', 'weekly-friday.html'), 'utf8');
    assert.match(weeklyHtml, /flyer-frame is-canceled cancel-banner--likely/);
    assert.match(weeklyHtml, /EventCancelled/);
    assert.match(weeklyHtml, /\/dance-event-viewer\/css\/cancel-banner\.css/);
    assert.match(weeklyHtml, /<\/div><p class="cancel-reason">Storm &lt;break&gt; &amp; rest<\/p>/);
    const ownerHtml = readFileSync(join(out, 'e', 'one-off.html'), 'utf8');
    assert.match(ownerHtml, /cancel-banner--owner/);
    assert.match(ownerHtml, /Canceled by owner\./);
    assert.doesNotMatch(ownerHtml, /class="cancel-reason"/);
    const normalHtml = readFileSync(join(out, 'e', 'normal.html'), 'utf8');
    assert.doesNotMatch(normalHtml, /is-canceled|EventCancelled|cancel-banner\.css/);
    assert.match(normalHtml, /EventScheduled/);
    assert.equal((readFileSync(join(out, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length, 4);
    // After the canceled Friday, the next Friday is a normal occurrence again.
    execFileSync(process.execPath, [join(TOOLS, 'build_share_pages.mjs'), '--root', root, '--out', out],
      { stdio: 'ignore', env: { ...process.env, SHARE_PAGES_TODAY: '2026-10-10' } });
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
