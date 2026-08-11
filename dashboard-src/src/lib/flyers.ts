/* Flyer URLs in the database are either absolute or relative to the published
   viewer, one level above the dashboard's own directory. */
export function resolveFlyerUrl(value: string | null | undefined): string {
  const url = value?.trim();
  if (!url || typeof window === "undefined") return url ?? "";
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  return new URL(url, new URL("../", window.location.href)).href;
}
