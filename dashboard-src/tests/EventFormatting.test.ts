import { describe, expect, it } from "vitest";
import {
  eventToForm,
  formatStringList,
  formatTime,
  formatTimeRange,
  parseStringList,
  resolveFlyerUrl,
} from "../src/pages/EventFormatting";
import type { DashboardEvent } from "../src/types";

function makeEvent(overrides: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    id: "id-1",
    event_key: "wcs-test-event",
    name: "Test Event",
    style: "West Coast Swing",
    event_type: "one_time",
    day_of_week: null,
    monthly_rule: null,
    exclude_monthly_rules: null,
    start_date: "2026-09-01",
    end_date: null,
    start_time: "19:00",
    end_time: "23:00",
    venue: "Test Venue",
    state: "FL",
    cost: "$10",
    source_url: "https://example.com/event",
    notes: "",
    last_confirmed: "2026-08-01",
    flyer_url: null,
    exclude_dates: null,
    record_status: "active",
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("formatStringList", () => {
  it("joins string members and drops everything else", () => {
    expect(formatStringList(["2026-01-01", 7, null, "2026-02-02"])).toBe("2026-01-01, 2026-02-02");
  });

  it("returns an empty string for non-arrays", () => {
    expect(formatStringList(null)).toBe("");
    expect(formatStringList("2026-01-01")).toBe("");
    expect(formatStringList(undefined)).toBe("");
  });
});

describe("parseStringList", () => {
  it("splits on commas and trims each item", () => {
    expect(parseStringList(" 2026-01-01 , 2026-02-02 ")).toEqual(["2026-01-01", "2026-02-02"]);
  });

  it("returns null when nothing usable remains", () => {
    expect(parseStringList("")).toBeNull();
    expect(parseStringList(" , , ")).toBeNull();
  });
});

describe("formatTime", () => {
  it("renders 12-hour times with a meridiem", () => {
    expect(formatTime("19:00")).toBe("7:00 PM");
    expect(formatTime("09:30")).toBe("9:30 AM");
  });

  it("treats midnight and noon as 12", () => {
    expect(formatTime("00:15")).toBe("12:15 AM");
    expect(formatTime("12:05")).toBe("12:05 PM");
  });

  it("accepts and discards a seconds component", () => {
    expect(formatTime("21:45:30")).toBe("9:45 PM");
    expect(formatTime("21:45:30.5")).toBe("9:45 PM");
  });

  it("returns an empty string for blank input", () => {
    expect(formatTime(null)).toBe("");
    expect(formatTime(undefined)).toBe("");
    expect(formatTime("   ")).toBe("");
  });

  it("passes through values it cannot parse", () => {
    expect(formatTime("doors at 7")).toBe("doors at 7");
    expect(formatTime("25:00")).toBe("25:00");
  });
});

describe("formatTimeRange", () => {
  it("joins both ends when both are present", () => {
    expect(formatTimeRange(makeEvent())).toBe("7:00 PM - 11:00 PM");
  });

  it("falls back to whichever end exists", () => {
    expect(formatTimeRange(makeEvent({ end_time: null }))).toBe("7:00 PM");
    expect(formatTimeRange(makeEvent({ start_time: null }))).toBe("11:00 PM");
  });

  it("returns an empty string when neither end exists", () => {
    expect(formatTimeRange(makeEvent({ start_time: null, end_time: null }))).toBe("");
  });
});

describe("resolveFlyerUrl", () => {
  it("keeps absolute and inline urls untouched", () => {
    expect(resolveFlyerUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(resolveFlyerUrl("HTTP://example.com/a.png")).toBe("HTTP://example.com/a.png");
    expect(resolveFlyerUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(resolveFlyerUrl("blob:https://example.com/x")).toBe("blob:https://example.com/x");
  });

  it("resolves relative urls against the dashboard's parent directory", () => {
    window.history.replaceState({}, "", "/dance-event-viewer/dashboard/index.html");
    expect(resolveFlyerUrl("graphics/logos/a.png")).toBe(
      `${window.location.origin}/dance-event-viewer/graphics/logos/a.png`,
    );
  });

  it("returns an empty string for missing values", () => {
    expect(resolveFlyerUrl(null)).toBe("");
    expect(resolveFlyerUrl("   ")).toBe("");
  });
});

describe("eventToForm", () => {
  it("stringifies list fields and copies scalars", () => {
    const form = eventToForm(makeEvent({
      exclude_dates: ["2026-12-25", 3],
      exclude_monthly_rules: ["first Friday"],
      in_wcs_list: true,
    }));
    expect(form.exclude_dates).toBe("2026-12-25");
    expect(form.exclude_monthly_rules).toBe("first Friday");
    expect(form.in_wcs_list).toBe(true);
    expect(form.event_key).toBe("wcs-test-event");
    expect(form.last_confirmed).toBe("2026-08-01");
  });

  it("replaces nulls with empty strings", () => {
    const form = eventToForm(makeEvent({ day_of_week: null, cost: null, state: null, flyer_url: null }));
    expect(form.day_of_week).toBe("");
    expect(form.cost).toBe("");
    expect(form.state).toBe("");
    expect(form.flyer_url).toBe("");
  });

  it("defaults a brand-new event to a WCS draft confirmed today", () => {
    const form = eventToForm(null);
    expect(form.style).toBe("West Coast Swing");
    expect(form.event_type).toBe("one_time");
    expect(form.record_status).toBe("draft");
    expect(form.in_wcs_list).toBe(false);
    expect(form.last_confirmed).toBe(new Date().toISOString().slice(0, 10));
  });
});
