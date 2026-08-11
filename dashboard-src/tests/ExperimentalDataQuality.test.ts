import { describe, expect, it } from "vitest";
import { buildDataQualityFindings, type DataQualityKind } from "../src/pages/ExperimentalDataQuality";
import type { DashboardEvent } from "../src/types";

const NOW = new Date("2026-08-01T00:00:00Z");

function makeEvent(overrides: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    id: "id-1",
    event_key: "wcs-clean-event",
    name: "Clean Event",
    style: "West Coast Swing",
    event_type: "weekly_recurring",
    day_of_week: "Friday",
    monthly_rule: null,
    exclude_monthly_rules: null,
    start_date: null,
    end_date: null,
    start_time: "19:00",
    end_time: "23:00",
    venue: "Clean Venue",
    state: "FL",
    cost: "$10",
    source_url: "https://example.com/event",
    notes: "",
    last_confirmed: "2026-07-01",
    flyer_url: "graphics/logos/clean.png",
    exclude_dates: null,
    record_status: "active",
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function kinds(events: DashboardEvent[], eventId?: string): DataQualityKind[] {
  return buildDataQualityFindings(events, NOW)
    .filter(finding => !eventId || finding.eventId === eventId)
    .map(finding => finding.kind)
    .sort();
}

describe("buildDataQualityFindings", () => {
  it("reports nothing for a complete, recently confirmed event", () => {
    expect(buildDataQualityFindings([makeEvent()], NOW)).toEqual([]);
  });

  it("skips archived events entirely", () => {
    const broken = makeEvent({ record_status: "archived", flyer_url: null, source_url: null, venue: "", last_confirmed: "" });
    expect(buildDataQualityFindings([broken], NOW)).toEqual([]);
  });

  it("flags a missing or blank flyer", () => {
    expect(kinds([makeEvent({ flyer_url: null })])).toContain("missing_flyer");
    expect(kinds([makeEvent({ flyer_url: "   " })])).toContain("missing_flyer");
  });

  it("flags source urls that are absent or not http(s)", () => {
    expect(kinds([makeEvent({ source_url: null })])).toContain("invalid_source_url");
    expect(kinds([makeEvent({ source_url: "not a url" })])).toContain("invalid_source_url");
    expect(kinds([makeEvent({ source_url: "ftp://example.com/e" })])).toContain("invalid_source_url");
    expect(kinds([makeEvent({ source_url: "http://example.com/e" })])).not.toContain("invalid_source_url");
  });

  it("flags verification that is missing, unparseable, or older than 180 days", () => {
    expect(kinds([makeEvent({ last_confirmed: "" })])).toContain("stale_verification");
    expect(kinds([makeEvent({ last_confirmed: "last spring" })])).toContain("stale_verification");
    expect(kinds([makeEvent({ last_confirmed: "2026-01-01" })])).toContain("stale_verification");
    expect(kinds([makeEvent({ last_confirmed: "2026-02-03" })])).not.toContain("stale_verification");
  });

  it("flags a missing venue or state", () => {
    expect(kinds([makeEvent({ venue: "" })])).toContain("incomplete_location");
    expect(kinds([makeEvent({ state: "  " })])).toContain("incomplete_location");
  });

  it("flags unparseable, out-of-range, and identical times", () => {
    expect(kinds([makeEvent({ start_time: "7pm sharp" })])).toContain("suspicious_time");
    expect(kinds([makeEvent({ end_time: "19:75" })])).toContain("suspicious_time");
    expect(kinds([makeEvent({ start_time: "13:00 PM" })])).toContain("suspicious_time");
    expect(kinds([makeEvent({ start_time: "0:30 AM" })])).toContain("suspicious_time");
    expect(kinds([makeEvent({ start_time: "24:00" })])).toContain("suspicious_time");
    expect(kinds([makeEvent({ start_time: "20:00", end_time: "20:00" })])).toContain("suspicious_time");
  });

  it("accepts 12-hour times and blank times", () => {
    expect(kinds([makeEvent({ start_time: "7:00 PM", end_time: "11:00 pm" })])).not.toContain("suspicious_time");
    expect(kinds([makeEvent({ start_time: "12:30 AM", end_time: "12:30 PM" })])).not.toContain("suspicious_time");
    expect(kinds([makeEvent({ start_time: null, end_time: null })])).not.toContain("suspicious_time");
  });

  it("pairs duplicates that share a normalized name and venue", () => {
    const a = makeEvent({ id: "a", event_key: "wcs-a", name: "Friday Night Swing", venue: "The Hall" });
    const b = makeEvent({ id: "b", event_key: "wcs-b", name: "friday-night  swing!", venue: "the hall" });
    const findings = buildDataQualityFindings([a, b], NOW).filter(finding => finding.kind === "possible_duplicate");
    expect(findings.map(finding => finding.eventId)).toEqual(["a", "b"]);
    expect(findings[0].detail).toContain("wcs-b");
    expect(findings[1].detail).toContain("wcs-a");
  });

  it("does not flag distinct events as duplicates", () => {
    const a = makeEvent({ id: "a", event_key: "wcs-a", name: "Friday Night Swing", venue: "The Hall" });
    const b = makeEvent({ id: "b", event_key: "wcs-b", name: "Friday Night Swing", venue: "Other Hall" });
    expect(kinds([a, b])).not.toContain("possible_duplicate");
  });

  it("keys findings per event and kind", () => {
    const findings = buildDataQualityFindings([makeEvent({ flyer_url: null })], NOW);
    expect(findings[0]).toMatchObject({
      key: "id-1:missing_flyer",
      eventId: "id-1",
      eventKey: "wcs-clean-event",
      eventName: "Clean Event",
      title: "Missing flyer",
    });
  });

  it("stacks every applicable finding on one bad record", () => {
    const bad = makeEvent({
      id: "bad",
      flyer_url: null,
      source_url: "nope",
      last_confirmed: "2025-01-01",
      venue: "",
      start_time: "nope",
    });
    expect(kinds([bad], "bad")).toEqual([
      "incomplete_location",
      "invalid_source_url",
      "missing_flyer",
      "stale_verification",
      "suspicious_time",
    ]);
  });
});
