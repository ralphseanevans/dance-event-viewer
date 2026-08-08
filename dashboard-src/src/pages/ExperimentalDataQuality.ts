import type { DashboardEvent } from "../types";

export type DataQualityKind =
  | "missing_flyer"
  | "invalid_source_url"
  | "stale_verification"
  | "incomplete_location"
  | "suspicious_time"
  | "possible_duplicate";

export interface DataQualityFinding {
  key: string;
  eventId: string;
  eventKey: string;
  eventName: string;
  kind: DataQualityKind;
  title: string;
  detail: string;
}

function validHttpUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseTimeMinutes(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return Number.NaN;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return Number.NaN;
  const suffix = match[3]?.toUpperCase();
  if (suffix) {
    if (hours < 1 || hours > 12) return Number.NaN;
    if (hours === 12) hours = 0;
    if (suffix === "PM") hours += 12;
  } else if (hours > 23) return Number.NaN;
  return hours * 60 + minutes;
}

function normalizedIdentity(event: DashboardEvent) {
  return `${event.name}|${event.venue}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildDataQualityFindings(events: DashboardEvent[], now = new Date()) {
  const findings: DataQualityFinding[] = [];
  const duplicateGroups = new Map<string, DashboardEvent[]>();
  const staleBefore = new Date(now);
  staleBefore.setUTCDate(staleBefore.getUTCDate() - 180);

  const add = (event: DashboardEvent, kind: DataQualityKind, title: string, detail: string) => {
    findings.push({
      key: `${event.id}:${kind}`,
      eventId: event.id,
      eventKey: event.event_key,
      eventName: event.name,
      kind,
      title,
      detail,
    });
  };

  for (const event of events.filter(item => item.record_status !== "archived")) {
    if (!event.flyer_url?.trim()) add(event, "missing_flyer", "Missing flyer", "No flyer URL is recorded.");
    if (!validHttpUrl(event.source_url)) add(event, "invalid_source_url", "Missing or invalid source link", "The source URL is empty or is not an HTTP(S) link.");
    const confirmed = new Date(`${event.last_confirmed}T00:00:00Z`);
    if (!event.last_confirmed || Number.isNaN(confirmed.getTime()) || confirmed < staleBefore) {
      add(event, "stale_verification", "Verification may be stale", "Last confirmation is missing, invalid, or more than 180 days old.");
    }
    if (!event.venue?.trim() || !event.state?.trim()) add(event, "incomplete_location", "Incomplete location", "Venue or state is missing.");
    const start = parseTimeMinutes(event.start_time);
    const end = parseTimeMinutes(event.end_time);
    if (Number.isNaN(start) || Number.isNaN(end) || (start !== null && end !== null && start === end)) {
      add(event, "suspicious_time", "Suspicious time", "Start/end time is invalid or the two times are identical.");
    }
    const identity = normalizedIdentity(event);
    const group = duplicateGroups.get(identity) ?? [];
    group.push(event);
    duplicateGroups.set(identity, group);
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    for (const event of group) {
      const others = group.filter(item => item.id !== event.id).map(item => item.event_key).join(", ");
      add(event, "possible_duplicate", "Possible duplicate", `Same normalized name and venue as: ${others}. Human review is required.`);
    }
  }
  return findings;
}
