import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMonths,
  currentMonth,
  firstDayOf,
  isMonth,
  lastDayOf,
  monthLabel,
  monthOfDate,
  monthRange,
  resolveMonth,
  TIME_ZONE,
  today,
} from "@/lib/month";

afterEach(() => {
  vi.useRealTimers();
});

describe("isMonth", () => {
  it.each(["2026-01", "2026-12", "1999-07"])("accepts %j", (value) => {
    expect(isMonth(value)).toBe(true);
  });

  it.each([
    "2026-00",
    "2026-13",
    "2026-1",
    "26-01",
    "2026-01-01",
    "",
    null,
    undefined,
    202601,
  ])("rejects %j", (value) => {
    expect(isMonth(value)).toBe(false);
  });
});

describe("currentMonth / today", () => {
  it("uses Regina time, not UTC", () => {
    expect(TIME_ZONE).toBe("America/Regina");
    // 03:00 UTC on Nov 1 is still 21:00 on Oct 31 in Regina (UTC-6).
    const lateOctober = new Date("2026-11-01T03:00:00Z");
    expect(currentMonth(lateOctober)).toBe("2026-10");
    expect(today(lateOctober)).toBe("2026-10-31");
  });

  it("rolls over once it is midnight in Regina", () => {
    const november = new Date("2026-11-01T06:00:00Z");
    expect(currentMonth(november)).toBe("2026-11");
    expect(today(november)).toBe("2026-11-01");
  });

  it("defaults to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T18:00:00Z"));
    expect(currentMonth()).toBe("2026-07");
    expect(today()).toBe("2026-07-04");
  });
});

describe("resolveMonth", () => {
  it("keeps a valid month", () => {
    expect(resolveMonth("2025-02")).toBe("2025-02");
  });

  it("falls back to the current month for anything else", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T18:00:00Z"));
    expect(resolveMonth("nope")).toBe("2026-03");
    expect(resolveMonth(undefined)).toBe("2026-03");
    expect(resolveMonth(["2025-02"])).toBe("2026-03");
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-10", 1, "2026-11"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-05", -17, "2024-12"],
    ["2026-05", 24, "2028-05"],
    ["2026-05", 0, "2026-05"],
  ])("%s %+d months is %s", (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected);
  });
});

describe("monthRange", () => {
  it("lists months ending at `end`, oldest first", () => {
    expect(monthRange("2026-02", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("handles a single month and an empty range", () => {
    expect(monthRange("2026-02", 1)).toEqual(["2026-02"]);
    expect(monthRange("2026-02", 0)).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("formats long and short labels", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2026-01", "short")).toMatch(/^Jan\.? 26$/);
  });
});

describe("day helpers", () => {
  it("gets the month of a date", () => {
    expect(monthOfDate("2026-10-23")).toBe("2026-10");
  });

  it("gets the first and last day of a month", () => {
    expect(firstDayOf("2026-02")).toBe("2026-02-01");
    expect(lastDayOf("2026-02")).toBe("2026-02-28");
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
    expect(lastDayOf("2026-04")).toBe("2026-04-30");
    expect(lastDayOf("2026-12")).toBe("2026-12-31");
  });
});
