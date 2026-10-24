import { afterEach, describe, expect, it, vi } from "vitest";
import { monthFrom } from "@/lib/search-params";

afterEach(() => {
  vi.useRealTimers();
});

describe("monthFrom", () => {
  it("reads ?month=", async () => {
    expect(await monthFrom(Promise.resolve({ month: "2025-06" }))).toBe(
      "2025-06",
    );
  });

  it("uses the first value when the param repeats", async () => {
    expect(
      await monthFrom(Promise.resolve({ month: ["2025-06", "2025-07"] })),
    ).toBe("2025-06");
  });

  it("falls back to the current month when missing or invalid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
    expect(await monthFrom(Promise.resolve({}))).toBe("2026-10");
    expect(await monthFrom(Promise.resolve({ month: "garbage" }))).toBe(
      "2026-10",
    );
  });
});
