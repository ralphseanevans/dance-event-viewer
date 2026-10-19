// Hub logic and both CLIs run offline with fixture data and temporary outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPensacolaArea, selectHubs, renderHubPage, sitemapFor } from '../build_hub_pages.mjs';
import { nextOccurrence } from '../event_schedule.mjs';

const TODAY = new Date('2026-10-13T12:00:00');
const event = (key, extra = {}) => ({ key, name: key, style: 'West Coast Swing', type: 'one_time',
  start_date: '2026-10-17', venue: 'Fixture Hall, Pensacola, FL', ...extra });
const weekly = (key, extra = {}) => event(key, { type: 'weekly_recurring', day_of_week: 'Thursday', start_date: null, ...extra });
const ld = html => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);

test('hub area: venue/city mentions only, with whole place names and case-insensitive matching', () => {
  for (const city of ['Pensacola', 'Gulf Breeze', 'Pace', 'Milton', 'Cantonment', 'Navarre', 'Perdido']) {
    assert.ok(isPensacolaArea(event('local', { venue: `Hall, ${city.toLowerCase()}, FL` })));
    assert.ok(isPensacolaArea({ city, venue: 'Fixture Hall' }));
  }
  for (const venue of [null, 'Space Ballroom', 'Hall, Miltonian', 'Hall, Mobile, AL']) {
    assert.equal(isPensacolaArea({ name: 'Pensacola Dance', venue }), false);
  }
});

test('hub selection: real style/name matches, two-listing threshold, stable date/key sorting and pure inputs', () => {
  const events = [
    event('wcs-b'), event('wcs-a'), weekly('wcs-early'),
    weekly('country', { style: 'Country/Western' }), weekly('country-swing', { style: 'Country Swing' }),
    weekly('line-name', { style: 'Mixed', name: 'Beginner Line Dances' }),
    weekly('line-style', { style: 'Line Dance / East Coast Swing' }),
    event('latin', { style: 'Latin' }), weekly('bachata', { style: 'Mixed', name: 'Bachata Class & Social' }),
    event('wrong-style', { style: 'East Coast Swing' }),
    event('out-of-area', { venue: 'Hall, Mobile, AL' }),
    event('name-only-area', { name: 'Pensacola WCS', venue: 'Hall' }),
    event('past', { start_date: '2026-10-12' }), event('undated', { start_date: null }),
    weekly('ended', { end_date: '2026-10-12' }), weekly('invalid-day', { day_of_week: 'Someday' }),
  ];
  const before = JSON.stringify(events);
  const beforeDate = TODAY.getTime();
  const hubs = selectHubs(events, TODAY);
  assert.deepEqual(hubs.map(h => h.slug), ['west-coast-swing', 'line-dancing', 'latin-bachata']);
  assert.deepEqual(hubs[0].events.map(e => e.key), ['wcs-early', 'wcs-a', 'wcs-b']);
  assert.deepEqual(hubs[1].events.map(e => e.key), ['country', 'country-swing', 'line-name', 'line-style']);
  assert.deepEqual(hubs[2].events.map(e => e.key), ['bachata', 'latin']);
  assert.deepEqual(selectHubs([weekly('single-series')], TODAY), [], 'one series does not count as multiple listings');
  assert.deepEqual(selectHubs([event('one'), event('old', { start_date: '2026-10-12' })], TODAY), []);
  assert.equal(JSON.stringify(events), before);
  assert.equal(TODAY.getTime(), beforeDate);
});

test('hub dates: honor start/end, weekly and monthly exclusions, ongoing events and inclusive build date', () => {
  const events = [
    weekly('excluded-date', { exclude_dates: ['2026-10-15'] }),
    weekly('excluded-rule', { exclude_monthly_rules: ['Third Thursday'] }),
    weekly('starts-later', { start_date: '2026-11-01' }),
    event('monthly', { type: 'monthly_recurring', start_date: null, monthly_rule: 'Third Saturday of the month', exclude_dates: ['2026-10-17'] }),
    event('last-monthly', { type: 'monthly_recurring', start_date: null, monthly_rule: 'Last Friday' }),
    event('fifth-monthly', { type: 'monthly_recurring', start_date: null, monthly_rule: 'Fifth Monday' }),
    event('ongoing', { start_date: '2026-10-12', end_date: '2026-10-14' }),
    event('today', { start_date: '2026-10-13' }),
    weekly('excluded-until-ended', { end_date: '2026-10-16', exclude_dates: ['2026-10-15'] }),
    event('past-monthly', { type: 'monthly_recurring', start_date: null, monthly_rule: 'First Saturday', end_date: '2026-10-12' }),
    event('invalid-monthly', { type: 'monthly_recurring', start_date: null, monthly_rule: 'Whenever' }),
  ];
  const hub = selectHubs(events, TODAY)[0];
  assert.deepEqual(hub.events.map(ev => [ev.key, nextOccurrence(ev, TODAY)]), [
    ['ongoing', '2026-10-12'], ['today', '2026-10-13'], ['excluded-date', '2026-10-22'],
    ['excluded-rule', '2026-10-22'], ['last-monthly', '2026-10-30'], ['starts-later', '2026-11-05'],
    ['monthly', '2026-11-21'], ['fifth-monthly', '2026-11-30'],
  ]);
});

test('hub HTML: dated owner cancellation reads "Officially canceled: <date>" with no ".:"', () => {
  const events = [weekly('weekly-owner', { canceled_dates: [{ date: '2026-10-15', cancel_status: 'owner' }] }),
    event('other', { start_date: '2026-11-01' }), event('other-2', { start_date: '2026-11-02' })];
  const hub = selectHubs(events, TODAY)[0];
  const html = renderHubPage(hub, TODAY);
  assert.match(html, /Officially canceled: 2026-10-15/);
  assert.doesNotMatch(html, /\.:/);
});

test('hub HTML: metadata, dated links, recurring section, matching ItemList, escaped data and existing GA4', () => {
  const events = [weekly('weekly', { name: 'Dance & Friends <strong>"test"</strong>', venue: 'Hall & Studio, Pensacola, FL',
    canceled_dates: [{ date: '2026-10-15', cancel_status: 'confirmed' }] }),
  event('monthly', { type: 'monthly_recurring', start_date: null, monthly_rule: 'Third Saturday', name: 'Dance </script><script>bad()</script>' }),
  event('one-off', { start_date: '2026-11-01', cancel_status: 'owner' })];
  const hub = selectHubs(events, TODAY)[0];
  const html = renderHubPage(hub, TODAY);
  const title = 'West Coast Swing in Pensacola, FL | Dance Event Viewer';
  assert.match(html, /<!DOCTYPE html>\s*<html lang="en">/);
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<meta property="og:title" content="${title}">`));
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/danceeventviewer.net\/pensacola\/west-coast-swing\/">/);
  for (const field of ['description', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:alt']) assert.ok(html.includes(`="${field}" content="`));
  assert.match(html, /<h1>West Coast Swing in Pensacola, FL<\/h1>/);
  assert.match(html, /3 upcoming west coast swing listings.*2 weekly or monthly series/);
  assert.match(html, /<h2>Upcoming<\/h2>/);
  assert.match(html, /<h2>Weekly and monthly<\/h2>/);
  assert.match(html, /\/e\/weekly.html">.* — 2026-10-15 — Hall &amp; Studio, Pensacola, FL/);
  assert.match(html, /Every Thursday/);
  assert.match(html, /Third Saturday/);
  assert.match(html, /CONFIRMED CANCELED: 2026-10-15/);
  assert.match(html, /Officially canceled\./);
  assert.match(html, /Dance &amp; Friends &lt;strong&gt;&quot;test&quot;&lt;\/strong&gt;/);
  assert.doesNotMatch(html, /<script>bad|tonight|undefined|null/i);
  assert.match(html, /href="\/dance-event-viewer\/"/);
  const json = ld(html);
  assert.equal(json['@type'], 'ItemList');
  assert.equal(json.numberOfItems, 3);
  assert.deepEqual(json.itemListElement.map(e => [e.position, e.name, e.url]), events.map((e, i) =>
    [i + 1, e.name, `https://danceeventviewer.net/e/${e.key}.html`]));
  assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
  assert.equal((html.match(/gtag\('config', 'G-HC9F04RL9D'\)/g) || []).length, 1);
});

test('hub output: unique titles, conservative style copy and empty recurring fallback', () => {
  const events = [event('wcs-1'), event('wcs-2'), event('line-1', { style: 'Country Swing' }),
    event('line-2', { style: 'Line Dance' }), event('latin-1', { style: 'Latin' }), event('latin-2', { style: 'Bachata' })];
  const pages = selectHubs(events, TODAY).map(hub => renderHubPage(hub, TODAY));
  assert.equal(new Set(pages.map(html => /<title>(.*?)<\/title>/.exec(html)[1])).size, 3);
  assert.match(pages[1], /line dance and country\/western listings/);
  assert.match(pages[2], /Latin listings and events explicitly named bachata/);
  for (const html of pages) assert.match(html, /No upcoming weekly or monthly series/);
});

test('hub sitemap: only eligible hub URLs, event verification dates preserved, no invented hub lastmod', () => {
  const events = [event('wcs-1', { verified_on: '2026-10-01' }), event('wcs-2'), event('single-latin', { style: 'Latin' }),
    event('past', { start_date: '2026-10-01' })];
  const sitemap = sitemapFor(events, TODAY);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 5);
  assert.match(sitemap, /<loc>https:\/\/danceeventviewer.net\/pensacola\/west-coast-swing\/<\/loc>/);
  assert.doesNotMatch(sitemap, /latin-bachata|line-dancing|\/e\/past.html/);
  assert.equal((sitemap.match(/<lastmod>/g) || []).length, 1);
  assert.match(sitemap, /<lastmod>2026-10-01<\/lastmod>/);
});

test('hub and share CLIs: --out isolation, identical sitemap, reported skips and stale hub cleanup', () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-root-'));
  const out = mkdtempSync(join(tmpdir(), 'hub-out-'));
  const shareOut = mkdtempSync(join(tmpdir(), 'hub-share-out-'));
  try {
    const source = JSON.stringify({ events: [event('first'), weekly('second')] });
    writeFileSync(join(root, 'dance_events.json'), source);
    mkdirSync(join(root, 'dance-event-viewer'));
    writeFileSync(join(root, 'dance-event-viewer', 'logo-map.json'), '{"logos":{},"patterns":[]}');
    const run = (tool, dest) => execFileSync(process.execPath,
      [fileURLToPath(new URL(`../${tool}.mjs`, import.meta.url)), '--root', root, '--out', dest],
      { encoding: 'utf8', env: { ...process.env, SHARE_PAGES_TODAY: '2026-10-13', TZ: 'UTC' } });
    const output = run('build_hub_pages', out);
    assert.match(output, /skipped \/pensacola\/line-dancing\/: fewer than 2/);
    assert.match(output, /skipped \/pensacola\/latin-bachata\/: fewer than 2/);
    assert.ok(existsSync(join(out, 'pensacola', 'west-coast-swing', 'index.html')));
    assert.ok(!existsSync(join(root, 'pensacola')) && !existsSync(join(root, 'sitemap.xml')));
    assert.equal(readFileSync(join(root, 'dance_events.json'), 'utf8'), source);
    run('build_share_pages', shareOut);
    for (const path of ['pensacola/west-coast-swing/index.html', 'sitemap.xml']) {
      assert.equal(readFileSync(join(shareOut, path), 'utf8'), readFileSync(join(out, path), 'utf8'));
    }
    writeFileSync(join(out, 'pensacola', 'west-coast-swing', 'keep.txt'), 'keep');
    writeFileSync(join(root, 'dance_events.json'), JSON.stringify({ events: [event('first')] }));
    run('build_hub_pages', out);
    assert.ok(!existsSync(join(out, 'pensacola', 'west-coast-swing', 'index.html')));
    assert.ok(existsSync(join(out, 'pensacola', 'west-coast-swing', 'keep.txt')));
    assert.doesNotMatch(readFileSync(join(out, 'sitemap.xml'), 'utf8'), /\/pensacola\//);
  } finally {
    for (const dir of [root, out, shareOut]) rmSync(dir, { recursive: true, force: true });
  }
});
