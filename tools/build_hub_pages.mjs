#!/usr/bin/env node
// Build supported Pensacola-area style hubs and the upcoming-event sitemap.
// Usage: node tools/build_hub_pages.mjs [--root .] [--out <dir>]
// Reads only dance_events.json. SHARE_PAGES_TODAY pins the build date.
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nextOccurrence, isPast, cancellationFor, cancelLabelText } from './event_schedule.mjs';

const SITE = 'https://danceeventviewer.net';
const GA_ID = 'G-HC9F04RL9D';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const HUBS = [
  { slug: 'west-coast-swing', label: 'West Coast Swing',
    matches: ev => /\bwest coast swing\b/i.test(ev.style || '') },
  { slug: 'line-dancing', label: 'Line Dancing',
    matches: ev => /\b(country|western|line danc(?:e|ing))\b/i.test(ev.style || '') || /\bline danc(?:e|es|ing)\b/i.test(ev.name || '') },
  { slug: 'latin-bachata', label: 'Latin and Bachata',
    matches: ev => /\b(latin|bachata)\b/i.test([ev.style, ev.name].filter(Boolean).join(' ')) },
];

export function isPensacolaArea(ev){
  return /\b(Pensacola|Gulf Breeze|Pace|Milton|Cantonment|Navarre|Perdido)\b/i.test(
    [ev.venue, ev.city].filter(Boolean).join(' '));
}

// A recurring series counts once, regardless of how many future dates it has.
export function selectHubs(events, today){
  const local = events.filter(ev => isPensacolaArea(ev) && !isPast(ev, today) && nextOccurrence(ev, today));
  return HUBS.map(({ slug, label, matches }) => ({ slug, label, path: `/pensacola/${slug}/`,
    events: local.filter(matches).sort((a, b) =>
      nextOccurrence(a, today).localeCompare(nextOccurrence(b, today)) || a.key.localeCompare(b.key))
  })).filter(hub => hub.events.length >= 2);
}

export function renderHubPage(hub, today){
  const title = `${hub.label} in Pensacola, FL | Dance Event Viewer`;
  const pageUrl = SITE + hub.path;
  const recurring = hub.events.filter(ev => /^(weekly|monthly)_recurring$/.test(ev.type));
  const intro = `${hub.events.length} upcoming ${hub.label.toLowerCase()} listings in the Pensacola area, including ${recurring.length} weekly or monthly series.`;
  const desc = `Find ${hub.events.length} upcoming ${hub.label.toLowerCase()} listings in the Pensacola area, with dates, venues and recurring schedules. Open the full dance calendar.`;
  const image = SITE + '/dance-event-viewer/assets/og-card.png';
  const cancelNote = ev => {
    const cancel = cancellationFor(ev, nextOccurrence(ev, today));
    return cancel ? ` <strong>${esc(cancel.whole ? cancel.label : `${cancelLabelText(cancel.label)}: ${nextOccurrence(ev, today)}`)}</strong>` : '';
  };
  const list = (events, schedule = false) => events.map(ev => {
    const when = schedule ? (ev.type === 'weekly_recurring' ? `Every ${ev.day_of_week}` : ev.monthly_rule) : nextOccurrence(ev, today);
    return `      <li><a href="/e/${esc(ev.key)}.html">${esc(ev.name)}</a> — ${esc(when)}${ev.venue ? ` — ${esc(ev.venue)}` : ''}${cancelNote(ev)}</li>`;
  }).join('\n');
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: title, url: pageUrl,
    numberOfItems: hub.events.length, itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: hub.events.map((ev, i) => ({ '@type': 'ListItem', position: i + 1,
      name: ev.name, url: `${SITE}/e/${ev.key}.html` })) };
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${image}">
<meta property="og:image:alt" content="Dance Event Viewer">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
</script>
<style>
  body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#101418;color:#e8edf2;line-height:1.5}
  main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
  h1{font-size:1.5rem;margin:.25rem 0 .75rem}
  h2{font-size:1.2rem;margin-top:32px}
  a{color:#7fd8c0}
  li{margin:.75rem 0;overflow-wrap:anywhere}
  strong{color:#ffd54a}
</style>
</head><body><main>
  <p><a href="/dance-event-viewer/">&larr; Dance Event Viewer</a></p>
  <h1>${esc(hub.label)} in Pensacola, FL</h1>
  <p>${esc(intro)}</p>
  ${hub.slug === 'line-dancing' ? '<p>This list includes line dance and country/western listings; each event page gives its listed style.</p>' : ''}
  ${hub.slug === 'latin-bachata' ? '<p>This list includes Latin listings and events explicitly named bachata; check each event page for its listed dance style.</p>' : ''}
  <p>Area listings may include Pensacola, Gulf Breeze, Pace, Milton, Cantonment, Navarre and Perdido. Open an event for its schedule and details.</p>
  <h2>Upcoming</h2>
  <ul>
${list(hub.events)}
  </ul>
  <h2>Weekly and monthly</h2>
${recurring.length ? `  <ul>\n${list(recurring, true)}\n  </ul>` : '  <p>No upcoming weekly or monthly series are listed for this style.</p>'}
  <p><a href="/dance-event-viewer/">Open the full calendar</a></p>
</main></body></html>
`;
}

export function sitemapFor(events, today){
  const urls = events.filter(ev => !isPast(ev, today)).map(ev => ({ pageUrl: `${SITE}/e/${ev.key}.html`,
    verified: /^\d{4}-\d{2}-\d{2}$/.test(ev.verified_on || '') ? ev.verified_on : null }));
  urls.push(...selectHubs(events, today).map(hub => ({ pageUrl: SITE + hub.path, verified: null })));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/dance-event-viewer/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls.map(({ pageUrl, verified }) => `  <url>\n    <loc>${esc(pageUrl)}</loc>\n${verified ? `    <lastmod>${verified}</lastmod>\n` : ''}    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n')}
</urlset>
`;
}

export function buildHubPages(events, today, out){
  const hubs = selectHubs(events, today);
  for (const { slug } of HUBS) {
    const page = join(out, 'pensacola', slug, 'index.html');
    const hub = hubs.find(h => h.slug === slug);
    if (hub) {
      mkdirSync(join(out, 'pensacola', slug), { recursive: true });
      writeFileSync(page, renderHubPage(hub, today));
    } else {
      if (existsSync(page)) unlinkSync(page); // Only our known generated hub file.
      console.log(`skipped /pensacola/${slug}/: fewer than 2 upcoming listings`);
    }
  }
  return hubs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const root = opt('--root') || (args[0] && !args[0].startsWith('--') ? args[0] : '.');
  const out = opt('--out') || root;
  const today = process.env.SHARE_PAGES_TODAY ? new Date(process.env.SHARE_PAGES_TODAY + 'T12:00:00') : new Date();
  today.setHours(12, 0, 0, 0);
  const data = JSON.parse(readFileSync(join(root, 'dance_events.json'), 'utf8'));
  const hubs = buildHubPages(data.events, today, out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'sitemap.xml'), sitemapFor(data.events, today));
  console.log(`built ${hubs.length} hub pages in ${join(out, 'pensacola')}/ and sitemap.xml`);
}
