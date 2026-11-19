// Retired /e/ URLs stay reachable as soft redirects. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRedirects, renderRedirectStub, emitRedirectStubs } from '../e_page_redirects.mjs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const TOOL = fileURLToPath(new URL('../build_share_pages.mjs', import.meta.url));

const EXPECTED = [
  {
    from: 'ttdgc-latin-groove-thursdays-the-block',
    to: '/e/the-block-latin-night-thursdays.html',
    kind: 'moved',
    canonical: 'https://danceeventviewer.net/e/the-block-latin-night-thursdays.html',
    refresh: 'the-block-latin-night-thursdays.html',
    noindex: false,
  },
  {
    from: 'ttdgc-bill-thrall-evermans-thursday',
    to: '/gulfcoast/',
    kind: 'gone',
    canonical: 'https://danceeventviewer.net/gulfcoast/',
    refresh: '../gulfcoast/',
    noindex: true,
  },
  {
    from: 'ballroom-lynn-warwick-house-2026-07-29',
    to: '/gulfcoast/',
    kind: 'gone',
    canonical: 'https://danceeventviewer.net/gulfcoast/',
    refresh: '../gulfcoast/',
    noindex: true,
  },
];

function assertStub(html, spec) {
  assert.equal(html, renderRedirectStub(spec));
  assert.match(html, new RegExp(`<link rel="canonical" href="${spec.canonical}">`));
  assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0; url=${spec.refresh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  const replaced = /location\.replace\(new URL\('([^']*)', location\.href\)\.pathname \+ location\.search \+ location\.hash\);/.exec(html);
  assert.ok(replaced, 'location.replace keeps search and hash');
  assert.equal(replaced[1], spec.refresh);
  assert.match(html, new RegExp(`<a href="${spec.refresh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  if (spec.noindex) assert.match(html, /<meta name="robots" content="noindex">/);
  else assert.doesNotMatch(html, /noindex/);
}

function fixtureEvent(key, name = 'Fixture Night') {
  return {
    key, name, style: 'Latin', type: 'one_time', day_of_week: null, monthly_rule: null,
    exclude_monthly_rules: null, exclude_dates: null, start_date: '2026-12-01', end_date: null,
    start_time: '19:00', end_time: '21:00', venue: 'Hall, Pensacola, FL', state: 'FL',
    cost: null, source_url: null, unverified: false, verified_on: null,
  };
}

function runBuilder(events) {
  const root = mkdtempSync(join(tmpdir(), 'e-redirect-root-'));
  const out = mkdtempSync(join(tmpdir(), 'e-redirect-out-'));
  mkdirSync(join(root, 'dance-event-viewer'));
  writeFileSync(join(root, 'dance-event-viewer', 'logo-map.json'), JSON.stringify({ logos: {}, patterns: [] }));
  writeFileSync(join(root, 'dance_events.json'), JSON.stringify({ events }));
  mkdirSync(join(out, 'e'), { recursive: true });
  writeFileSync(join(out, 'e', 'ttdgc-bill-thrall-evermans-thursday.html'), 'STALE STUB');
  writeFileSync(join(out, 'e', 'removed-event.html'), 'deleted event page');
  const run = () => spawnSync(process.execPath, [TOOL, '--root', root, '--out', out], {
    encoding: 'utf8',
    env: { ...process.env, SHARE_PAGES_TODAY: '2026-10-08', TZ: 'UTC' },
  });
  try {
    return { root, out, first: run(), second: run() };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
    throw err;
  }
}

test('committed redirect stubs match the map, and the live The Block page stays', () => {
  const map = loadRedirects();
  assert.deepEqual(map, EXPECTED.map(({ from, to, kind }) => ({ from, to, kind })));
  for (const spec of EXPECTED) assertStub(read(`e/${spec.from}.html`), spec);
  const live = read('e/the-block-latin-night-thursdays.html');
  assert.doesNotMatch(live, /http-equiv="refresh"/);
  assert.match(live, /<link rel="canonical" href="https:\/\/danceeventviewer\.net\/e\/the-block-latin-night-thursdays\.html">/);
  assert.match(live, /Latin Groove Thursdays at The Block/);
});

test('sitemap omits the three retired event keys', () => {
  const sitemap = read('sitemap.xml');
  for (const spec of EXPECTED) assert.doesNotMatch(sitemap, new RegExp(`/e/${spec.from}\\.html`));
  assert.match(sitemap, /<loc>https:\/\/danceeventviewer\.net\/e\/the-block-latin-night-thursdays\.html<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/danceeventviewer\.net\/gulfcoast\/<\/loc>/);
});

test('share-page builder re-emits redirect stubs after the e/*.html wipe and leaves them out of the sitemap', () => {
  const built = runBuilder([fixtureEvent('still-listed')]);
  try {
    for (const result of [built.first, built.second]) {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /3 redirect stubs/);
    }
    assert.ok(!existsSync(join(built.out, 'e', 'removed-event.html')));
    for (const spec of EXPECTED) assertStub(readFileSync(join(built.out, 'e', `${spec.from}.html`), 'utf8'), spec);
    const sitemap = readFileSync(join(built.out, 'sitemap.xml'), 'utf8');
    for (const spec of EXPECTED) assert.doesNotMatch(sitemap, new RegExp(`/e/${spec.from}\\.html`));
    assert.match(sitemap, /\/e\/still-listed\.html/);
  } finally {
    rmSync(built.root, { recursive: true, force: true });
    rmSync(built.out, { recursive: true, force: true });
  }
});

test('share-page builder skips a redirect stub when the from key is a live event', () => {
  const key = 'ttdgc-latin-groove-thursdays-the-block';
  const built = runBuilder([fixtureEvent(key, 'Live Latin Night')]);
  try {
    assert.equal(built.first.status, 0, built.first.stderr);
    assert.match(built.first.stderr, new RegExp(`redirect stub skipped: ${key} is a live event page`));
    const html = readFileSync(join(built.out, 'e', `${key}.html`), 'utf8');
    assert.match(html, /Live Latin Night/);
    assert.doesNotMatch(html, /http-equiv="refresh"|noindex/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://danceeventviewer\\.net/e/${key}\\.html">`));
    for (const spec of EXPECTED.filter(item => item.from !== key)) {
      assertStub(readFileSync(join(built.out, 'e', `${spec.from}.html`), 'utf8'), spec);
    }
    const sitemap = readFileSync(join(built.out, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, new RegExp(`/e/${key}\\.html`));
    assert.doesNotMatch(sitemap, /ttdgc-bill-thrall-evermans-thursday|ballroom-lynn-warwick-house-2026-07-29/);
  } finally {
    rmSync(built.root, { recursive: true, force: true });
    rmSync(built.out, { recursive: true, force: true });
  }
});

test('emit helper rewrites a deleted stub and does not overwrite a live page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e-redirect-emit-'));
  try {
    const redirects = loadRedirects();
    emitRedirectStubs(dir, redirects, []);
    const gone = EXPECTED[1];
    const file = join(dir, 'e', `${gone.from}.html`);
    rmSync(file);
    assert.equal(emitRedirectStubs(dir, redirects, []), redirects.length);
    assertStub(readFileSync(file, 'utf8'), gone);
    writeFileSync(join(dir, 'e', `${EXPECTED[0].from}.html`), 'LIVE PAGE');
    const warnings = [];
    assert.equal(emitRedirectStubs(dir, redirects, [EXPECTED[0].from], message => warnings.push(message)), 2);
    assert.equal(readFileSync(join(dir, 'e', `${EXPECTED[0].from}.html`), 'utf8'), 'LIVE PAGE');
    assert.match(warnings.join('\n'), new RegExp(EXPECTED[0].from));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
