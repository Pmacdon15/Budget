import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCANS_PER_DAY,
  DEFAULT_SCANS_PER_HOUR,
  retryAfterSeconds,
  scanLimitMessage,
  scanLimits,
  scanWindows,
} from "@/lib/receipt-scan-limit";

describe("scanLimits", () => {
  it("defaults to 20 an hour and 100 a day", () => {
    expect(scanLimits({})).toEqual({ perHour: 20, perDay: 100 });
    expect(DEFAULT_SCANS_PER_HOUR).toBe(20);
    expect(DEFAULT_SCANS_PER_DAY).toBe(100);
  });

  it("takes positive whole numbers from the environment", () => {
    expect(
      scanLimits({ RECEIPT_SCANS_PER_HOUR: "5", RECEIPT_SCANS_PER_DAY: "30" }),
    ).toEqual({ perHour: 5, perDay: 30 });
  });

  it("ignores values that aren't positive whole numbers", () => {
    for (const bad of ["", " ", "0", "-3", "2.5", "lots"]) {
      expect(
        scanLimits({ RECEIPT_SCANS_PER_HOUR: bad, RECEIPT_SCANS_PER_DAY: bad }),
      ).toEqual({ perHour: 20, perDay: 100 });
    }
  });
});

describe("scanWindows", () => {
  it("is the UTC hour and day the moment falls in", () => {
    const { hour, day } = scanWindows(new Date("2026-10-25T05:24:35.123Z"));
    expect(hour.start.toISOString()).toBe("2026-10-25T05:00:00.000Z");
    expect(hour.end.toISOString()).toBe("2026-10-25T06:00:00.000Z");
    expect(day.start.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("retryAfterSeconds", () => {
  const now = new Date("2026-10-25T23:59:30.400Z");

  it("counts whole seconds to the end of the window", () => {
    expect(retryAfterSeconds(now, "hour")).toBe(30);
    expect(retryAfterSeconds(now, "day")).toBe(30);
    expect(retryAfterSeconds(new Date("2026-10-25T12:00:00Z"), "day")).toBe(
      12 * 3600,
    );
  });

  it("is never less than a second", () => {
    expect(
      retryAfterSeconds(new Date("2026-10-25T05:59:59.999Z"), "hour"),
    ).toBe(1);
  });
});

describe("scanLimitMessage", () => {
  it("says when to try again and offers adding it by hand", () => {
    expect(scanLimitMessage("hour")).toMatch(/this hour/);
    expect(scanLimitMessage("day")).toMatch(/tomorrow/);
    expect(scanLimitMessage("hour")).toMatch(/by hand/);
  });
});
