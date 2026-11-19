// Soft redirects for retired /e/<key>.html URLs.
// GitHub Pages cannot send HTTP 301, so each entry becomes a tiny HTML stub:
// meta refresh, location.replace that keeps search+hash, a no-JS link, and a canonical.
// kind "gone" has no successor event and is noindex. kind "moved" consolidates to a live page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_RE } from './lib.mjs';

const SITE = 'https://danceeventviewer.net';
export const REDIRECT_MAP_PATH = join(dirname(fileURLToPath(import.meta.url)), 'e-page-redirects.json');

function validateRedirect(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('redirect entry must be an object');
  if (typeof entry.from !== 'string' || !KEY_RE.test(entry.from)) throw new Error(`bad redirect from: ${entry.from}`);
  if (typeof entry.to !== 'string' || !/^\/(?!\/)[A-Za-z0-9._~/-]*$/.test(entry.to) || entry.to.includes('..')) {
    throw new Error(`bad redirect to: ${entry.to}`);
  }
  if (entry.kind !== 'moved' && entry.kind !== 'gone') throw new Error(`redirect ${entry.from}: kind must be moved or gone`);
}

export function loadRedirects(path = REDIRECT_MAP_PATH) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`${path} must be an array`);
  const seen = new Set();
  for (const entry of data) {
    validateRedirect(entry);
    if (seen.has(entry.from)) throw new Error(`duplicate redirect from ${entry.from}`);
    seen.add(entry.from);
  }
  return data;
}

// Relative URL from /e/<from>.html. A same-folder successor is the filename;
// anything else (including /gulfcoast/) steps up one directory.
export function refreshUrlFromEventPage(to) {
  if (to.startsWith('/e/') && !to.slice('/e/'.length).includes('/')) return to.slice('/e/'.length);
  return `../${to.replace(/^\//, '')}`;
}

function linkLabel(entry) {
  if (entry.to === '/gulfcoast/' || entry.to === '/gulfcoast') return 'Gulf Coast';
  return 'the new event page';
}

const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escJs = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');

export function renderRedirectStub(entry) {
  validateRedirect(entry);
  const href = refreshUrlFromEventPage(entry.to);
  const canonical = `${SITE}${entry.to}`;
  const robots = entry.kind === 'gone' ? '<meta name="robots" content="noindex">\n' : '';
  const title = entry.kind === 'moved'
    ? 'This page has moved | Dance Event Viewer'
    : 'Gulf Coast | Dance Event Viewer';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="canonical" href="${escAttr(canonical)}">
${robots}<meta http-equiv="refresh" content="0; url=${escAttr(href)}">
<script>location.replace(new URL('${escJs(href)}', location.href).pathname + location.search + location.hash);</script>
</head>
<body>
<p>This page has moved to <a href="${escAttr(href)}">${linkLabel(entry)}</a>.</p>
</body>
</html>
`;
}

// Write e/<from>.html for each redirect. Skip a from that is still a live event key
// so a real page is never replaced by a stub.
export function emitRedirectStubs(outDir, redirects, liveKeys, warn = console.warn) {
  const live = new Set(liveKeys || []);
  mkdirSync(join(outDir, 'e'), { recursive: true });
  let written = 0;
  for (const entry of redirects) {
    if (live.has(entry.from)) {
      warn(`redirect stub skipped: ${entry.from} is a live event page`);
      continue;
    }
    writeFileSync(join(outDir, 'e', `${entry.from}.html`), renderRedirectStub(entry));
    written++;
  }
  return written;
}
