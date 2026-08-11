/* URLs stored on records come from crawlers and public submissions, so they are
   validated before ever being rendered as a link: only http(s) is allowed, which
   keeps javascript:/data: values out of this authenticated dashboard. */
export function safeHttpUrl(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function isHttpUrl(value: string | null | undefined): boolean {
  return safeHttpUrl(value) !== "";
}
