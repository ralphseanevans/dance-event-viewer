// Gulf Coast page (formerly Experimental Viewer 2) lives at /gulfcoast/. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const r = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('gulfcoast page: name, canonical and OG tags, no visitor-facing "Experiment"', () => {
  const html = r('gulfcoast/index.html');
  assert.match(html, /<title>Gulf Coast \| Dance Event Viewer<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/danceeventviewer\.net\/gulfcoast\/">/);
  assert.match(html, /og:title" content="Gulf Coast \| Dance Event Viewer"/);
  assert.match(html, /og:url" content="https:\/\/danceeventviewer\.net\/gulfcoast\/"/);
  assert.doesNotMatch(html, /experiment/i);
  assert.match(html, /<h1 id="hero-title" class="topbar-title"><span>GULF<\/span> <em>COAST<\/em><\/h1>/);
  assert.match(html, /src="\.\.\/dance-event-viewer\/js\/supabase-config\.js\?v=/);
});

test('gulfcoast module paths point at the viewer folder and the site root', () => {
  const js = r('gulfcoast/simple-flow.mjs');
  assert.match(js, /const VIEWER = new URL\('\.\.\/dance-event-viewer\/', import\.meta\.url\)/);
  assert.match(js, /const SITE = new URL\('\.\.\/', import\.meta\.url\)/);
});

test('old experience-2 URL is a tiny redirect that keeps query and hash', () => {
  const html = r('dance-event-viewer/experiments/experience-2/index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/danceeventviewer\.net\/gulfcoast\/">/);
  assert.match(html, /http-equiv="refresh" content="0; url=\.\.\/\.\.\/\.\.\/gulfcoast\/"/);
  assert.match(html, /location\.replace\(.*location\.search \+ location\.hash\)/);
  assert.ok(!existsSync(new URL('../../dance-event-viewer/experiments/experience-2/simple-flow.mjs', import.meta.url)), 'only one copy of the page');
});

test('viewer nav links say Gulf Coast and no visible "Experimental" label', () => {
  const html = r('dance-event-viewer/index.html');
  assert.match(html, /<a href="\.\.\/gulfcoast\/" class="experimental-viewer-link nav-gulfcoast">Gulf Coast<\/a>/);
  assert.doesNotMatch(html, /experience-2/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ' '), /Experimental/);
  assert.doesNotMatch(r('dance-event-viewer/experiments/location-discovery/index.html').replace(/<[^>]*>/g, ' '), /Experimental/);
});
