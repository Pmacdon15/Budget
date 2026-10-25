import { describe, expect, it } from "vitest";
import { countScan, selectScanCounts } from "@/db/receipt-scans";
import { rows } from "../../helpers/test-db";

const limits = { perHour: 2, perDay: 3 };
const at = (iso: string) => new Date(iso);

describe("countScan", () => {
  it("counts scans per hour and per day until either is full", async () => {
    const now = at("2026-10-25T09:15:00Z");
    expect(await countScan("user_a", now, limits)).toBe(true);
    expect(await countScan("user_a", now, limits)).toBe(true);
    expect(await countScan("user_a", now, limits)).toBe(false);
    expect(await selectScanCounts("user_a", now)).toEqual({ hour: 2, day: 2 });

    // A new hour: the hour resets, the day doesn't.
    const later = at("2026-10-25T10:01:00Z");
    expect(await countScan("user_a", later, limits)).toBe(true);
    expect(await countScan("user_a", later, limits)).toBe(false);
    expect(await selectScanCounts("user_a", later)).toEqual({
      hour: 1,
      day: 3,
    });

    // A new day resets both.
    const tomorrow = at("2026-10-26T00:00:01Z");
    expect(await countScan("user_a", tomorrow, limits)).toBe(true);
    expect(await selectScanCounts("user_a", tomorrow)).toEqual({
      hour: 1,
      day: 1,
    });
  });

  it("counts each user separately", async () => {
    const now = at("2026-10-25T09:15:00Z");
    await countScan("user_a", now, limits);
    await countScan("user_a", now, limits);
    expect(await countScan("user_a", now, limits)).toBe(false);
    expect(await countScan("user_b", now, limits)).toBe(true);
    expect(await selectScanCounts("user_b", now)).toEqual({ hour: 1, day: 1 });
  });

  it("doesn't count a refused scan", async () => {
    const now = at("2026-10-25T09:15:00Z");
    for (let i = 0; i < 5; i++) await countScan("user_a", now, limits);
    expect(await selectScanCounts("user_a", now)).toEqual({ hour: 2, day: 2 });
  });

  it("prunes the user's windows from before yesterday", async () => {
    await countScan("user_a", at("2026-10-20T09:00:00Z"), limits);
    await countScan("user_b", at("2026-10-20T09:00:00Z"), limits);
    await countScan("user_a", at("2026-10-25T09:00:00Z"), limits);
    const left = await rows(
      "select user_id, window_start from receipt_scan_counts order by user_id, window_start",
    );
    expect(left.filter((r) => r.user_id === "user_a")).toHaveLength(2);
    expect(left.filter((r) => r.user_id === "user_b")).toHaveLength(2);
  });
});
