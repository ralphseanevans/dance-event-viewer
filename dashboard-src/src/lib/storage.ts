/* Dashboard view preferences. Storage is unavailable in private modes and
   whenever the quota is full, so every read falls back and every write is
   allowed to fail: a lost preference must never break a page. */

export function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStored(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* preferences are optional */ }
}
