// Browser repro for the Gulf Coast phone calendar jump (#76, re-checked for #77):
// 390x844 touch, scroll to the sticky calendar, Next to the following month, tap a day, then the next day.
// The tapped day must be the enlarged (.is-active) day and its date heading must land on the landing line
// (the same top as on main; e.g. 380.6 for Nov 22 on the 2026-10-23 data). Also checks Ctrl+F across a
// whole title and that no title text contains U+2060 / U+2011.
// Not part of `node --test` (needs Chrome + playwright-core). Usage:
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node tools/browser/gulfcoast_phone_tap.mjs <url> [YYYY-MM-DD ...] [--runs=3] [--compare=<main url>]
const args = process.argv.slice(2);
const url = args.find(a => /^https?:/.test(a)) || 'http://localhost:8000/gulfcoast/';
const compare = (args.find(a => a.startsWith('--compare=')) || '').slice(10) || null;
const runs = +((args.find(a => a.startsWith('--runs=')) || '--runs=3').slice(7));
const days = args.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!days.length) days.push('2026-11-22', '2026-11-23');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function once(u) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: 'America/Chicago',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(u, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.calendar-days button[data-date]', { timeout: 30000 }); await wait(800);
  const cdp = await ctx.newCDPSession(page);
  const settle = async () => { let last = -1, same = 0; const t0 = Date.now(); while (Date.now() - t0 < 4000) { const y = await page.evaluate(() => scrollY); if (y === last) { if (++same >= 5) break; } else same = 0; last = y; await wait(100); } await wait(300); };
  const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  const tap = async p => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await wait(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const t = await page.evaluate(() => document.querySelector('.calendar-sticky').getBoundingClientRect().top + scrollY);
  await page.evaluate(y => scrollTo({ top: y + 150, behavior: 'instant' }), t); await settle();
  const month = (await page.evaluate(() => document.querySelector('.calendar-month-label').textContent));
  const want = new Date(days[0] + 'T12:00:00').toLocaleString('en-US', { month: 'long' });
  for (let k = 0; k < 3 && !(await page.evaluate(() => document.querySelector('.calendar-month-label').textContent)).startsWith(want); k++) { await tap(await center('.calendar-next')); await wait(600); }
  const out = { from: month, month: await page.evaluate(() => document.querySelector('.calendar-month-label').textContent), taps: [] };
  for (const d of days) {
    await tap(await center(`.calendar-days button[data-date="${d}"]`)); await settle(); await wait(500);
    out.taps.push(await page.evaluate(d => {
      const bs = [...document.querySelectorAll('.calendar-days button[data-date]')]; const sz = bs.map(b => parseFloat(getComputedStyle(b).fontSize)); const base = Math.min(...sz);
      const h = document.getElementById('simple-date-' + d);
      return { day: d, active: bs.filter(b => b.classList.contains('is-active')).map(b => b.dataset.date), big: bs.filter((b, i) => sz[i] > base + 0.01).map(b => b.dataset.date), headTop: h ? Math.round(h.getBoundingClientRect().top * 10) / 10 : null };
    }, d));
  }
  out.find = await page.evaluate(() => { let n = 0; getSelection().removeAllRanges(); while (window.find('Dance with Seaside Swing-Outs', false, false, false, false, false, false) && n < 20) n++; getSelection().removeAllRanges(); return n; });
  out.joiners = await page.evaluate(() => [...document.querySelectorAll('#simple-groups .tile-name')].filter(t => /[\u2060\u2011]/.test(t.textContent)).length);
  out.errors = errs; await ctx.close(); return out;
}

let fail = 0;
try {
  const ref = {};
  if (compare) { const r = await once(compare); r.taps.forEach(x => { ref[x.day] = x.headTop; }); console.log('main', JSON.stringify(r)); }
  for (let i = 0; i < runs; i++) {
    const r = await once(url); console.log('run' + i, JSON.stringify(r));
    for (const x of r.taps) {
      const ok = x.active.join() === x.day && x.big.join() === x.day && x.headTop != null && (ref[x.day] == null || Math.abs(x.headTop - ref[x.day]) <= 1.5);
      if (!ok) { fail++; console.log(`  FAIL ${x.day}: active ${x.active} big ${x.big} headTop ${x.headTop} (main ${ref[x.day]})`); }
    }
    if (r.joiners || r.errors.length) { fail++; console.log('  FAIL joiners/errors', r.joiners, r.errors); }
  }
} finally { await browser.close(); }
console.log(fail ? `FAIL (${fail})` : 'PASS'); process.exit(fail ? 1 : 0);
