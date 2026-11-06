// Homepage sends visitors to the existing /gulfcoast/ page. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const canonical = (html) => /<link rel="canonical" href="([^"]+)">/.exec(html)[1];

test('root redirect lands on /gulfcoast/ and shares that page\'s canonical', () => {
  const root = read('index.html');
  const gulf = read('gulfcoast/index.html');
  assert.match(root, /<meta http-equiv="refresh" content="0; url=gulfcoast\/">/);
  assert.doesNotMatch(root, /url=dance-event-viewer\//);
  assert.match(root, /<a href="gulfcoast\/">Pensacola &amp; Gulf Coast dances<\/a>/);
  assert.equal(canonical(root), 'https://danceeventviewer.net/gulfcoast/');
  assert.equal(canonical(root), canonical(gulf));
  assert.match(root, /<title>Gulf Coast \| Dance Event Viewer<\/title>/);
  assert.match(root, /og:title" content="Gulf Coast \| Dance Event Viewer"/);
  assert.match(root, /og:url" content="https:\/\/danceeventviewer\.net\/gulfcoast\/"/);
  assert.match(root, /og:image" content="https:\/\/danceeventviewer\.net\/graphics\/og\/gulfcoast-1200x630\.jpg\?v=855b43f8"/);
  assert.doesNotMatch(root, /Dance Events Across the South|og-card\.jpg/);
  assert.equal((root.match(/google-site-verification" content="9asRWpgwsR3krpG9mZA1Np_EPLmDSkor_2EmcFJ7jbQ"/g) || []).length, 1);
  assert.equal((root.match(/gtag\('config', 'G-HC9F04RL9D'\)/g) || []).length, 1);
  assert.equal((root.match(/googletagmanager\.com\/gtag\/js\?id=G-HC9F04RL9D/g) || []).length, 1);
  assert.ok(existsSync(new URL('../../graphics/og/gulfcoast-1200x630.jpg', import.meta.url)));
});

test('South-wide viewer stays at its path and links back to Gulf Coast', () => {
  const viewer = read('dance-event-viewer/index.html');
  assert.equal(canonical(viewer), 'https://danceeventviewer.net/dance-event-viewer/');
  assert.doesNotMatch(viewer, /http-equiv="refresh"/);
  assert.match(viewer, /<a href="\.\.\/gulfcoast\/" class="experimental-viewer-link">Pensacola &amp; Gulf Coast dances<\/a>/);
  assert.match(viewer, /google-site-verification" content="9asRWpgwsR3krpG9mZA1Np_EPLmDSkor_2EmcFJ7jbQ"/);
  assert.match(read('dance-event-viewer/css/styles.css'), /a\[href="\.\.\/gulfcoast\/"\]/);
});

test('Gulf Coast, Pensacola hubs, event pages, and llms.txt keep their own targets', () => {
  const gulf = read('gulfcoast/index.html');
  assert.doesNotMatch(gulf, /http-equiv="refresh"/);
  assert.match(gulf, /src="\.\.\/dance-event-viewer\/js\/supabase-config\.js\?v=/);
  const hub = read('pensacola/west-coast-swing/index.html');
  assert.equal(canonical(hub), 'https://danceeventviewer.net/pensacola/west-coast-swing/');
  assert.match(hub, /href="\/dance-event-viewer\/"/);
  const event = read('e/salsa-lindy-crossover-night-2026-07-24.html');
  assert.equal(canonical(event), 'https://danceeventviewer.net/e/salsa-lindy-crossover-night-2026-07-24.html');
  assert.match(event, /href="\/dance-event-viewer\/"/);
  const llms = read('llms.txt');
  assert.match(llms, /https:\/\/danceeventviewer\.net\/gulfcoast\//);
  assert.match(llms, /https:\/\/danceeventviewer\.net\/dance-event-viewer\//);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/danceeventviewer\.net\/gulfcoast\/<\/loc>/);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/danceeventviewer\.net\/dance-event-viewer\/<\/loc>/);
  assert.doesNotMatch(read('sitemap.xml'), /<loc>https:\/\/danceeventviewer\.net\/<\/loc>/);
});
