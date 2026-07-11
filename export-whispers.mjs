// Optional: snapshot the last 30 Dance Whispers from Firebase into
// whisper-bubble.json for archival purposes. Firebase remains the live
// source the page reads from — this file is just a periodic backup/record,
// same spirit as dance_events.json's role vs. the page.
//
// Run manually:  node export-whispers.mjs
// Requires the same databaseURL as WHISPER_FIREBASE_CONFIG in index.html.
// No Firebase Admin SDK / credentials needed — the "whispers" node has
// public .read: true in the security rules, so a plain REST GET works.

const DATABASE_URL = process.env.WHISPER_DB_URL || ""; // e.g. https://your-project-default-rtdb.firebaseio.com
const OUT_FILE = new URL("./whisper-bubble.json", import.meta.url);

if (!DATABASE_URL) {
  console.error("Set WHISPER_DB_URL to your Firebase databaseURL first.");
  process.exit(1);
}

const url = `${DATABASE_URL}/whispers.json?orderBy="ts"&limitToLast=30`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const data = await res.json(); // { pushId: { text, ts }, ... } or null

const whispers = Object.values(data || {})
  .sort((a, b) => (a.ts || 0) - (b.ts || 0))
  .map((w) => ({ text: w.text, ts: w.ts }));

const fs = await import("node:fs/promises");
const payload = {
  _meta: {
    purpose:
      "Periodic snapshot/archive of the live Dance Whispers feed. Firebase Realtime Database is the live source of truth (see js/whispers.js) — this file is not read by the page.",
    last_synced: new Date().toISOString(),
  },
  whispers,
};
await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${whispers.length} whispers to whisper-bubble.json`);
