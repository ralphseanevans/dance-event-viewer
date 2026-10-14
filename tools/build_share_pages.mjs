#!/usr/bin/env node
// Build the per-event landing pages (e/<key>.html) and sitemap.xml.
//
// For each event in dance_events.json, writes e/<key>.html with event-specific
// title/description/Open Graph tags, a self-referencing canonical, schema.org Event
// JSON-LD (next occurrence for recurring events), the flyer, a link to the full
// calendar, the organizer link when public, related-event links, and the public GA4 tag.
// Canceled events and canceled occurrences get the same yellow cancel bar as the
// viewer (docs/cancel-banners.md) and eventStatus EventCancelled in the JSON-LD.
//
// Usage (from the repo root):
//   node tools/build_share_pages.mjs [--root .] [--out <dir>]
// --root is where dance_events.json, dance-event-viewer/logo-map.json and e/img live.
// --out is where e/*.html and sitemap.xml are written (default: same as --root).
// For a dry run, pass --out to a temp dir so committed pages are untouched.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const root = opt('--root') || (args[0] && !args[0].startsWith('--') ? args[0] : '.');
const out = opt('--out') || root;
const SITE = 'https://danceeventviewer.net';
const GA_ID = 'G-HC9F04RL9D';
const data = JSON.parse(readFileSync(join(root, 'dance_events.json'), 'utf8'));
const lm = JSON.parse(readFileSync(join(root, 'dance-event-viewer', 'logo-map.json'), 'utf8'));
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const DAYS_FMT = { weekday:'short', month:'short', day:'numeric', year:'numeric' };
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
// SHARE_PAGES_TODAY=YYYY-MM-DD pins "today" (used by the tests).
const today = process.env.SHARE_PAGES_TODAY ? new Date(process.env.SHARE_PAGES_TODAY + 'T12:00:00') : new Date();
today.setHours(12, 0, 0, 0);

function fmtTime(x){ const [h,m] = x.split(':'); const H = +h; return `${((H+11)%12)+1}:${m} ${H<12?'AM':'PM'}`; }
function sched(ev){
  const t = ev.start_time ? ' · ' + [ev.start_time, ev.end_time].filter(Boolean).map(fmtTime).join('–') : '';
  if (ev.type === 'weekly_recurring' && ev.day_of_week) return `Every ${ev.day_of_week}${t}`;
  if (ev.type === 'monthly_recurring' && ev.monthly_rule) return `${ev.monthly_rule}${t}`;
  if (ev.start_date) { const d = new Date(ev.start_date + 'T12:00:00'); return d.toLocaleDateString('en-US', DAYS_FMT) + t; }
  return t.slice(3);
}
function logoFor(key){
  const first = value => Array.isArray(value)
    ? value.find(item => typeof item === 'string' && item)
    : (typeof value === 'string' && value ? value : null);
  if (lm.logos && lm.logos[key]) return first(lm.logos[key]);
  for (const p of lm.patterns || []) if (key.includes(p.contains)) return first(p.logo);
  return null;
}
function iso(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Cancel banners: same rules as cancellationFor() in dance-event-viewer/js/app.js.
const CANCEL_BANNER_LABELS = { confirmed: 'CONFIRMED CANCELED', likely: 'LIKELY CANCELED', owner: 'CANCELED BY OWNER' };
const normCancelStatus = s => { const k = typeof s === 'string' ? s.trim().toLowerCase() : ''; return CANCEL_BANNER_LABELS[k] ? k : 'likely'; };
// Returns { status, label, whole } or null. `day` is an optional YYYY-MM-DD occurrence.
function cancellationFor(ev, day){
  if (!ev) return null;
  const make = (status, whole) => { const s = normCancelStatus(status); return { status: s, label: CANCEL_BANNER_LABELS[s], whole }; };
  if (typeof ev.cancel_status === 'string' && ev.cancel_status.trim()) return make(ev.cancel_status, true);
  if (ev.canceled === true || ev.cancelled === true) return make(null, true);
  if (day && Array.isArray(ev.canceled_dates)) for (const c of ev.canceled_dates) {
    if (c === day) return make(null, false);
    if (c && typeof c === 'object' && c.date === day) return make(c.cancel_status, false);
  }
  return null;
}

// Ordinal-weekday parsing for monthly rules and weekly exclusions ("3rd Saturday").
function parseOrdinalRule(rule){
  const m = /(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i.exec(String(rule || ''));
  if (!m) return null;
  const ordMap = { '1st':1, first:1, '2nd':2, second:2, '3rd':3, third:3, '4th':4, fourth:4, '5th':5, fifth:5, last:-1 };
  return { ord: ordMap[m[1].toLowerCase()], weekday: WEEKDAYS.findIndex(w => w.toLowerCase() === m[2].toLowerCase()) };
}
function nthWeekdayOfMonth(year, month, ord, weekday){ // month 0-based
  if (ord === -1) {
    const last = new Date(year, month + 1, 0, 12);
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month + 1, 0 - diff, 12);
  }
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  const d = new Date(year, month, 1 + offset + (ord - 1) * 7, 12);
  return d.getMonth() === month ? d : null;
}
function matchesOrdinalRule(date, rule){
  const r = parseOrdinalRule(rule);
  if (!r) return false;
  const n = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), r.ord, r.weekday);
  return !!n && iso(n) === iso(date);
}
// Next occurrence on/after today for JSON-LD startDate. Returns YYYY-MM-DD or null.
function nextOccurrence(ev){
  const excluded = new Set(Array.isArray(ev.exclude_dates) ? ev.exclude_dates : []);
  const ended = d => ev.end_date && iso(d) > ev.end_date;
  if (ev.type === 'weekly_recurring' && ev.day_of_week) {
    const wd = WEEKDAYS.findIndex(w => w.toLowerCase() === String(ev.day_of_week).toLowerCase());
    if (wd < 0) return null;
    const d = new Date(today);
    d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
    for (let i = 0; i < 8; i++) { // skip excluded dates / excluded ordinal weeks
      const excludedByRule = (ev.exclude_monthly_rules || []).some(r => matchesOrdinalRule(d, r));
      if (!excluded.has(iso(d)) && !excludedByRule) return ended(d) ? null : iso(d);
      d.setDate(d.getDate() + 7);
    }
    return null;
  }
  if (ev.type === 'monthly_recurring' && ev.monthly_rule) {
    const r = parseOrdinalRule(ev.monthly_rule);
    if (!r) return null;
    for (let i = 0; i < 4; i++) {
      const d = nthWeekdayOfMonth(today.getFullYear(), today.getMonth() + i, r.ord, r.weekday);
      if (d && d >= today && !excluded.has(iso(d))) return ended(d) ? null : iso(d);
    }
    return null;
  }
  return ev.start_date || null; // one_time / tentative: use the published date even if past
}
function eventJsonLd(ev, pageUrl, imgUrl, desc){
  const startDay = nextOccurrence(ev);
  if (!startDay) return null;
  const startDate = ev.start_time ? `${startDay}T${ev.start_time}:00` : startDay;
  const endDay = (ev.type === 'one_time' && ev.end_date) ? ev.end_date : startDay;
  const endDate = ev.end_time ? `${endDay}T${ev.end_time}:00` : (endDay !== startDay ? endDay : undefined);
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.name,
    startDate,
    ...(endDate ? { endDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: String(ev.venue || '').split(',')[0].trim() || 'See event details',
      address: [ev.venue, ev.state].filter(Boolean).join(', ') },
    image: [imgUrl],
    description: desc,
    url: pageUrl,
  };
  if (ev.cost) {
    const m = /(\d+(?:\.\d{2})?)/.exec(String(ev.cost));
    const free = /free/i.test(String(ev.cost));
    if (free || m) obj.offers = { '@type': 'Offer', price: free ? '0' : m[1], priceCurrency: 'USD',
      description: String(ev.cost), url: pageUrl, availability: 'https://schema.org/InStock' };
  }
  return obj;
}
function relatedLinks(ev, all){
  const pool = all.filter(o => o.key !== ev.key);
  const sameState = pool.filter(o => o.state && o.state === ev.state);
  const sameStyle = pool.filter(o => o.style && o.style === ev.style && (!o.state || o.state !== ev.state));
  const picks = [...sameState, ...sameStyle].slice(0, 6);
  if (!picks.length) return '';
  const items = picks.map(o =>
    `<li><a href="/e/${esc(o.key)}.html">${esc(o.name)}</a>${o.venue ? ` — ${esc(String(o.venue).split(',')[0])}` : ''}</li>`).join('\n      ');
  return `\n  <section class="related"><h2>More dances nearby</h2>\n    <ul>\n      ${items}\n    </ul>\n  </section>`;
}

mkdirSync(join(out, 'e'), { recursive: true });
for (const f of readdirSync(join(out,'e'))) if (f.endsWith('.html')) unlinkSync(join(out,'e',f)); // stale pages from removed events
let n = 0;
const urls = [];
for (const ev of data.events) {
  // Prefer the composed date-panel image in e/img (flyer + day/date/time), else the
  // raw flyer from logo-map.json, else the site card.
  const composed = join(root, 'e', 'img', ev.key + '.jpg');
  const img = logoFor(ev.key);
  const imgUrl = existsSync(composed) ? `${SITE}/e/img/${ev.key}.jpg`
    : img ? SITE + img.replace(/^\.\.\//, '/') : SITE + '/dance-event-viewer/assets/og-card.png';
  const desc = [sched(ev), ev.venue, ev.cost].filter(Boolean).join(' · ') + ' — on Dance Event Viewer, dance events across the South.';
  const title = esc(ev.name) + ' — Dance Event Viewer';
  const pageUrl = `${SITE}/e/${ev.key}.html`;
  const cancel = cancellationFor(ev, nextOccurrence(ev));
  const ld = eventJsonLd(ev, pageUrl, imgUrl, desc);
  if (ld && cancel) ld.eventStatus = 'https://schema.org/EventCancelled';
  const sentence = cancel ? cancel.label.charAt(0) + cancel.label.slice(1).toLowerCase() : '';
  const cancelNote = cancel ? `<p class="meta cancel-note"><strong>${esc(cancel.whole ? sentence : `${sentence}: ${nextOccurrence(ev)}`)}</strong></p>` : '';
  const flyer = cancel
    ? `<div class="flyer-frame is-canceled cancel-banner--${cancel.status}"><img class="flyer" src="${imgUrl}" alt="${esc(ev.name)} flyer"><span class="cancel-banner-sr">${esc(sentence)}.</span></div>`
    : `<img class="flyer" src="${imgUrl}" alt="${esc(ev.name)} flyer">`;
  const srcLink = (typeof ev.source_url === 'string' && /^https?:\/\//i.test(ev.source_url.trim()))
    ? `<p class="src"><a href="${esc(ev.source_url.trim())}" rel="noopener nofollow" target="_blank">Event details from the organizer</a></p>` : '';
  writeFileSync(join(out, 'e', ev.key + '.html'),
`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${imgUrl}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${pageUrl}">
${cancel ? '<link rel="stylesheet" href="/dance-event-viewer/css/cancel-banner.css">\n' : ''}${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n` : ''}<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
gtag('event', 'share_page_landing', { event_key: '${esc(ev.key)}' });
</script>
<style>
  body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#101418;color:#e8edf2;line-height:1.5}
  main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
  h1{font-size:1.5rem;margin:.25rem 0 .75rem}
  .meta{color:#a9b7c2;margin:.25rem 0}
  img.flyer{max-width:100%;height:auto;border-radius:12px;margin:12px 0}
  .flyer-frame{margin:12px 0}
  .flyer-frame img.flyer{display:block;width:100%;margin:0}
  .cancel-note{color:#ffd54a}
  .cta{display:inline-block;background:#2dd4a7;color:#062019;font-weight:600;padding:12px 22px;border-radius:999px;text-decoration:none;margin:16px 0}
  .cta:hover{filter:brightness(1.1)}
  a{color:#7fd8c0}
  .related{margin-top:32px;border-top:1px solid #26313a;padding-top:16px}
  .related h2{font-size:1.05rem}
  .related ul{padding-left:18px}
  footer{margin-top:40px;font-size:.85rem;color:#7c8892}
</style>
</head><body>
<main>
  <p class="meta"><a href="/dance-event-viewer/">&larr; Dance Event Viewer — dance events across the South</a></p>
  <h1>${esc(ev.name)}</h1>
  ${sched(ev) ? `<p class="meta"><strong>When:</strong> ${esc(sched(ev))}</p>` : ''}
  ${ev.venue ? `<p class="meta"><strong>Where:</strong> ${esc(ev.venue)}</p>` : ''}
  ${ev.cost ? `<p class="meta"><strong>Cost:</strong> ${esc(ev.cost)}</p>` : ''}
  ${ev.style ? `<p class="meta"><strong>Style:</strong> ${esc(ev.style)}</p>` : ''}
  ${cancelNote}${flyer}
  <p><a class="cta" href="/dance-event-viewer/">Open the full calendar</a></p>
  ${srcLink}${relatedLinks(ev, data.events)}
  <footer>Listed on <a href="/dance-event-viewer/">Dance Event Viewer</a> — West Coast Swing and partner dance events across the South.</footer>
</main>
</body></html>
`); n++;
  urls.push(pageUrl);
}

// sitemap.xml at the repo root — the viewer first, then every event page.
const lastmod = iso(today);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/dance-event-viewer/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls.map(u => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n')}
</urlset>
`;
writeFileSync(join(out, 'sitemap.xml'), sitemap);
console.log(`built ${n} event pages in ${join(out, 'e')}/ and sitemap.xml with ${n + 1} URLs`);
