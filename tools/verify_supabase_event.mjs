#!/usr/bin/env node
// Fast post-write verification for one event. Reads the public row the live viewer receives.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// READ ONLY. Usage (from the repo root):
//   node tools/verify_supabase_event.mjs <event-key> [expected-fields.json] [supabase-config.js]
const [,, eventKey, expectedJsonArg, configPathArg = 'dance-event-viewer/js/supabase-config.js'] = process.argv;
if (!eventKey) {
  console.error('Usage: node tools/verify_supabase_event.mjs <event-key> [expected-fields.json] [supabase-config.js]');
  process.exit(2);
}
const text = readFileSync(resolve(configPathArg), 'utf8');
const pick = (name) => {
  const match = text.match(new RegExp(`${name}\\s*:\\s*["']([^"']+)["']`));
  if (!match) throw new Error(`Missing ${name} in ${configPathArg}`);
  return match[1];
};
const url = pick('url').replace(/\/$/, '');
const key = pick('publishableKey');
const table = pick('table');
const endpoint = `${url}/rest/v1/${encodeURIComponent(table)}?select=*&key=eq.${encodeURIComponent(eventKey)}&limit=2`;
const response = await fetch(endpoint, { method: 'GET', headers: { apikey: key, 'Cache-Control': 'no-cache' } });
if (!response.ok) throw new Error(`Supabase read-back failed (${response.status}): ${await response.text()}`);
const rows = await response.json();
if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Expected exactly one public row for ${eventKey}; found ${rows?.length ?? 'invalid response'}`);
if (expectedJsonArg) {
  const expected = JSON.parse(readFileSync(resolve(expectedJsonArg), 'utf8'));
  for (const [field, value] of Object.entries(expected)) {
    if (JSON.stringify(rows[0][field]) !== JSON.stringify(value)) {
      throw new Error(`Read-back mismatch for ${eventKey}.${field}: expected ${JSON.stringify(value)}, received ${JSON.stringify(rows[0][field])}`);
    }
  }
}
console.log(`verified live Supabase row: ${eventKey} (version ${rows[0].version ?? 'public'})`);
