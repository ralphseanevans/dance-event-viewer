import type { DashboardEvent } from "../types";

export const editableFields = [
  "name", "style", "event_type", "day_of_week", "monthly_rule", "start_date", "end_date",
  "start_time", "end_time", "venue", "state", "cost", "source_url", "notes", "last_confirmed", "flyer_url",
  "exclude_dates", "exclude_monthly_rules",
] as const;

export type EventFormState = Record<(typeof editableFields)[number], string> & {
  event_key: string;
  record_status: string;
  in_wcs_list: boolean;
};

export function formatStringList(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

export function parseStringList(value: string): string[] | null {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : null;
}

export function formatTime(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return text;
  const hour = Number(match[1]);
  if (hour > 23) return text;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatTimeRange(event: DashboardEvent): string {
  const start = formatTime(event.start_time);
  const end = formatTime(event.end_time);
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

export function resolveFlyerUrl(value: string | null | undefined): string {
  const url = value?.trim();
  if (!url || typeof window === "undefined") return url ?? "";
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  return new URL(url, new URL("../", window.location.href)).href;
}

export function eventToForm(event?: DashboardEvent | null): EventFormState {
  return {
    event_key: event?.event_key ?? "",
    name: event?.name ?? "",
    style: event?.style ?? "West Coast Swing",
    event_type: event?.event_type ?? "one_time",
    day_of_week: event?.day_of_week ?? "",
    monthly_rule: event?.monthly_rule ?? "",
    exclude_monthly_rules: formatStringList(event?.exclude_monthly_rules),
    start_date: event?.start_date ?? "",
    end_date: event?.end_date ?? "",
    start_time: event?.start_time ?? "",
    end_time: event?.end_time ?? "",
    venue: event?.venue ?? "",
    state: event?.state ?? "",
    cost: event?.cost ?? "",
    source_url: event?.source_url ?? "",
    notes: event?.notes ?? "",
    last_confirmed: event?.last_confirmed ?? new Date().toISOString().slice(0, 10),
    flyer_url: event?.flyer_url ?? "",
    exclude_dates: formatStringList(event?.exclude_dates),
    record_status: event?.record_status ?? "draft",
    in_wcs_list: event?.in_wcs_list ?? false,
  };
}
