#!/usr/bin/env node
// Check the static site's crawl and event landing-page basics.
// Usage: node tools/check_site.mjs [--root .] [--live]
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { mapsSearchUrl } from './lib.mjs';

const SITE_HOST = 'danceeventviewer.net';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const LIVE_CONCURRENCY = 5;

function decodeXml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x'
      ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name.toLowerCase()];
  });
}

function parseSitemap(xml) {
  const errors = [];
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) errors.push('sitemap.xml: DTD/entity declarations are unsupported');
  const stack = [];
  const locs = [];
  const tokenRe = /<!--[\s\S]*?-->|<\?[^?]*\?>|<![^>]*>|<[^>]+>|[^<]+/g;
  let token;
  while ((token = tokenRe.exec(xml))) {
    const value = token[0];
    if (value.startsWith('<!--') || value.startsWith('<?') || value.startsWith('<!')) continue;
    if (value.startsWith('</')) {
      const name = value.slice(2, -1).trim().toLowerCase();
      if (stack.pop() !== name) errors.push(`sitemap.xml: mismatched closing tag </${name}>`);
    } else if (value.startsWith('<')) {
      const m = /^<([\w:.-]+)(?:\s[^>]*)?\s*(\/?)>$/.exec(value);
      if (!m) { errors.push('sitemap.xml: malformed XML tag'); continue; }
      const name = m[1].toLowerCase();
      if (!m[2]) stack.push(name);
    } else if (stack.at(-1) === 'loc') {
      const loc = decodeXml(value.trim());
      if (loc) locs.push(loc);
    }
  }
  if (stack.length) errors.push(`sitemap.xml: unclosed <${stack.at(-1)}> tag`);
  if (!/<urlset(?:\s|>)/i.test(xml)) errors.push('sitemap.xml: expected a <urlset> document');
  if (!locs.length) errors.push('sitemap.xml: no <loc> URLs found');
  return { locs, errors };
}

function attrs(tag) {
  const out = {};
  const body = tag.replace(/^<[^\s>]+|\s*\/?\s*>$/g, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function htmlReferences(html) {
  const refs = [];
  const imgs = [];
  const re = /<(a|area|link|script|img|source|iframe|video|audio|form|input)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[0]);
    if (tag === 'img') imgs.push(a);
    for (const key of ['href', 'src']) if (a[key]) refs.push({ tag, key, value: a[key] });
    if (tag === 'form' && a.action) refs.push({ tag, key: 'action', value: a.action });
  }
  return { refs, imgs };
}

function localPathForUrl(url, root) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  const relative = pathname.replace(/^\/+/, '') || 'index.html';
  const target = resolve(root, relative);
  return target === root || target.startsWith(root + sep) ? target : null;
}

function resolveInternal(value, page, root) {
  if (/^(?:data:|blob:|mailto:|tel:|javascript:)/i.test(value) || value.startsWith('#')) return null;
  let url;
  try { url = new URL(value, `${SITE_ORIGIN}/${page.replaceAll(sep, '/')}`); } catch { return { error: `invalid URL ${value}` }; }
  if (url.hostname.toLowerCase() !== SITE_HOST) return null;
  const target = localPathForUrl(url, root);
  if (!target) return { error: `path escapes site root: ${value}` };
  return { target, display: url.pathname };
}

function robotsAllowsRoot(robots) {
  let active = false;
  let hasRules = false;
  let allows = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      active = value === '*';
      hasRules = false;
    } else if (active && (field === 'allow' || field === 'disallow')) {
      hasRules = true;
      if (field === 'allow' && value === '/') allows = true;
      if (field === 'disallow' && value === '/') allows = false;
    }
  }
  return allows || !hasRules;
}

export async function checkSite(rootPath = '.', { live = false, fetcher = fetch } = {}) {
  const root = resolve(rootPath);
  const errors = [];
  const notes = [];
  const robotsPath = join(root, 'robots.txt');
  const sitemapPath = join(root, 'sitemap.xml');
  let locs = [];

  if (!existsSync(robotsPath)) errors.push('robots.txt: file is missing');
  else {
    const robots = readFileSync(robotsPath, 'utf8');
    if (!robotsAllowsRoot(robots)) errors.push('robots.txt: does not allow / for user-agent *');
    if (!/^\s*Sitemap:\s*https?:\/\/danceeventviewer\.net\/sitemap\.xml\s*$/im.test(robots)) {
      errors.push('robots.txt: missing Sitemap reference to https://danceeventviewer.net/sitemap.xml');
    }
  }

  if (!existsSync(sitemapPath)) errors.push('sitemap.xml: file is missing');
  else {
    const parsed = parseSitemap(readFileSync(sitemapPath, 'utf8'));
    errors.push(...parsed.errors);
    locs = parsed.locs;
    for (const loc of locs) {
      let url;
      try { url = new URL(loc); } catch { errors.push(`sitemap.xml: invalid URL ${loc}`); continue; }
      if (url.hostname.toLowerCase() !== SITE_HOST) continue;
      const target = localPathForUrl(url, root);
      if (!target) errors.push(`sitemap.xml: URL escapes site root: ${loc}`);
      else if (!existsSync(target)) errors.push(`sitemap.xml: ${url.pathname} has no local file`);
    }
  }

  const pagesDir = join(root, 'e');
  let pageFiles = [];
  if (!existsSync(pagesDir)) errors.push('e/: directory is missing');
  else {
    const { readdirSync } = await import('node:fs');
    pageFiles = readdirSync(pagesDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
      .map(entry => join(pagesDir, entry.name));
    // Map-link guard (2026-10-14): a share page's Google Maps link must be built from
    // THAT event's own venue (exact key lookup in dance_events.json), never another venue.
    let venueByKey = null;
    try {
      const data = JSON.parse(readFileSync(join(root, 'dance_events.json'), 'utf8').replace(/\u0000+\s*$/g, '').trim());
      venueByKey = new Map((data.events || []).map(ev => [ev.key, ev]));
    } catch { venueByKey = null; }
    for (const pageFile of pageFiles) {
      const page = pageFile.slice(root.length + 1);
      const html = readFileSync(pageFile, 'utf8');
      const { refs, imgs } = htmlReferences(html);
      imgs.forEach((img, i) => { if (!Object.hasOwn(img, 'alt')) errors.push(`${page}: img ${i + 1} is missing alt`); });
      for (const ref of refs) {
        const resolved = resolveInternal(ref.value, page, root);
        if (resolved?.error) errors.push(`${page}: ${ref.key} ${resolved.error}`);
        else if (resolved && !existsSync(resolved.target)) errors.push(`${page}: ${ref.key} ${ref.value} has no local file`);
      }
      const mapsLink = html.match(/href="(https:\/\/www\.google\.com\/maps\/[^"]*)"/);
      const ev = venueByKey?.get(pageFile.slice(pagesDir.length + 1).replace(/\.html$/, ''));
      if (mapsLink && ev) {
        const expected = mapsSearchUrl(ev.venue, ev.state);
        if (mapsLink[1].replace(/&amp;/g, '&') !== expected)
          errors.push(`${page}: Google Maps link does not match the event's venue "${ev.venue}"`);
      }
      const jsonLdRe = /<script\b(?=[^>]*\btype\s*=\s*(["'])application\/ld\+json\1)[^>]*>([\s\S]*?)<\/script\s*>/gi;
      let block;
      while ((block = jsonLdRe.exec(html))) {
        try { JSON.parse(block[2]); } catch (err) { errors.push(`${page}: invalid JSON-LD (${err.message})`); }
      }
    }
  }

  let liveChecked = 0;
  if (live) {
    const urls = [...new Set(locs.filter(loc => { try { return new URL(loc).hostname.toLowerCase() === SITE_HOST; } catch { return false; } }))];
    let next = 0;
    const workers = Array.from({ length: Math.min(LIVE_CONCURRENCY, urls.length) }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        try {
          const response = await fetcher(url, { method: 'HEAD', redirect: 'follow' });
          liveChecked++;
          if (response.status !== 200) errors.push(`live: ${url} returned HTTP ${response.status}`);
        } catch (err) { liveChecked++; errors.push(`live: ${url} failed (${err.message})`); }
      }
    });
    await Promise.all(workers);
  } else notes.push('Live URL checks skipped (pass --live to enable).');

  return { errors, notes, sitemapUrls: locs.length, eventPages: pageFiles.length, liveChecked };
}

function parseArgs(args) {
  let root = '.';
  let live = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') {
      if (!args[i + 1]) throw new Error('--root needs a directory');
      root = args[++i];
    } else if (args[i] === '--live') live = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return { root, live };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    const { root, live } = parseArgs(process.argv.slice(2));
    const result = await checkSite(root, { live });
    console.log(`Site check: ${result.errors.length ? 'FAIL' : 'PASS'}`);
    console.log(`  sitemap URLs: ${result.sitemapUrls}`);
    console.log(`  event pages: ${result.eventPages}`);
    if (live) console.log(`  live URLs checked: ${result.liveChecked}`);
    for (const note of result.notes) console.log(`  note: ${note}`);
    for (const error of result.errors) console.error(`  error: ${error}`);
    if (result.errors.length) process.exitCode = 1;
  } catch (err) { console.error(`Site check: FAIL\n  error: ${err.message}`); process.exitCode = 1; }
}
