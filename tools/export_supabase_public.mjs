#!/usr/bin/env node
// Generate the static fallback (dance_events.json) from Supabase, the source of truth.
// READ ONLY: it only GETs public.event_listings with the publishable key from the
// viewer config. It never writes to Supabase.
//
// Usage (from the repo root):
//   node tools/export_supabase_public.mjs <output.json> [supabase-config.js]
// The config defaults to dance-event-viewer/js/supabase-config.js. Write to a temp
// path first and review the diff before replacing the committed dance_events.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FIELDS, CANCEL_FIELDS, addCancelFields, validateCancelFields } from './lib.mjs';

export const DEFAULT_CONFIG = 'dance-event-viewer/js/supabase-config.js';

export function readConfig(configText, label = 'config') {
  const pick = (name) => {
    const match = configText.match(new RegExp(`${name}\\s*:\\s*["']([^"']+)["']`));
    if (!match) throw new Error(`Missing ${name} in ${label}`);
    return match[1];
  };
  return { url: pick('url').replace(/\/$/, ''), publishableKey: pick('publishableKey'), table: pick('table') };
}

// Fetches every public row. Asks for the cancel columns too; if the database doesn't
// have them (HTTP 400), retries once with the base 18 fields, like the viewer does.
export async function exportEvents({ url, publishableKey, table }, fetcher = fetch) {
  const pageSize = 500;
  const load = async (fields) => {
    const events = [];
    for (let offset = 0; ; offset += pageSize) {
      const endpoint = `${url}/rest/v1/${encodeURIComponent(table)}?select=${fields.join(',')}&order=key.asc&offset=${offset}&limit=${pageSize}`;
      const response = await fetcher(endpoint, { method: 'GET', headers: { apikey: publishableKey } });
      if (response.status === 400 && offset === 0 && fields.length > PUBLIC_FIELDS.length) return null;
      if (!response.ok) throw new Error(`Supabase export failed (${response.status}): ${await response.text()}`);
      const page = await response.json();
      if (!Array.isArray(page)) throw new Error('Supabase export did not return an array.');
      events.push(...page);
      if (page.length < pageSize) break;
    }
    return events;
  };
  const rows = (await load([...PUBLIC_FIELDS, ...CANCEL_FIELDS])) ?? (await load(PUBLIC_FIELDS));

  if (!rows.length) throw new Error('Refusing to generate an empty fallback.');
  const keys = rows.map((event) => event.key);
  if (new Set(keys).size !== keys.length) throw new Error('Supabase export contains duplicate event keys.');
  const allowed = new Set([...PUBLIC_FIELDS, ...CANCEL_FIELDS]);
  return rows.map((row) => {
    if (!/^[A-Za-z0-9._-]+$/.test(row.key || '')) throw new Error(`Unsafe or missing event key: ${row.key}`);
    for (const field of PUBLIC_FIELDS) if (!(field in row)) throw new Error(`Missing public field ${field} for ${row.key}`);
    for (const field of Object.keys(row)) if (!allowed.has(field)) throw new Error(`Unexpected public field ${field} for ${row.key}`);
    const errs = validateCancelFields(row);
    if (errs.length) throw new Error(`${row.key}: ${errs.join('; ')}`);
    const event = {};
    for (const field of PUBLIC_FIELDS) event[field] = row[field];
    return addCancelFields(event, row);
  });
}

async function main() {
  const [,, outputPathArg, configPathArg = DEFAULT_CONFIG] = process.argv;
  if (!outputPathArg) {
    console.error('Usage: node tools/export_supabase_public.mjs <output.json> [supabase-config.js]');
    process.exit(2);
  }
  const config = readConfig(readFileSync(resolve(configPathArg), 'utf8'), configPathArg);
  const events = await exportEvents(config);
  const outputPath = resolve(outputPathArg);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ events }, null, 2) + '\n', 'utf8');
  const canceled = events.filter((e) => e.cancel_status || e.canceled_dates).length;
  console.log(`exported ${events.length} Supabase events -> ${outputPath} (18 fields + cancel fields on ${canceled} events)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
