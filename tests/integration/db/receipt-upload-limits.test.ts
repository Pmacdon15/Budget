import { describe, expect, it } from "vitest";
import { countUpload, selectUploadUsage } from "@/db/receipt-upload-limits";
import { rows } from "../../helpers/test-db";

const limits = { perDay: 3, bytesPerDay: 1000 };
const at = (iso: string) => new Date(iso);

describe("countUpload", () => {
  it("counts uploads and bytes per day until either is full", async () => {
    const now = at("2026-10-25T09:15:00Z");
    expect(await countUpload("user_a", now, 100, limits)).toBe(true);
    expect(await countUpload("user_a", now, 100, limits)).toBe(true);
    expect(await countUpload("user_a", now, 100, limits)).toBe(true);
    expect(await countUpload("user_a", now, 1, limits)).toBe(false);
    expect(await selectUploadUsage("user_a", now)).toEqual({
      count: 3,
      bytes: 300,
    });

    // A new UTC day starts over.
    const tomorrow = at("2026-10-26T00:00:01Z");
    expect(await countUpload("user_a", tomorrow, 100, limits)).toBe(true);
    expect(await selectUploadUsage("user_a", tomorrow)).toEqual({
      count: 1,
      bytes: 100,
    });
  });

  it("refuses an upload that would take the day past its bytes", async () => {
    const now = at("2026-10-25T09:15:00Z");
    expect(await countUpload("user_a", now, 900, limits)).toBe(true);
    expect(await countUpload("user_a", now, 101, limits)).toBe(false);
    expect(await countUpload("user_a", now, 100, limits)).toBe(true);
    expect(await selectUploadUsage("user_a", now)).toEqual({
      count: 2,
      bytes: 1000,
    });
  });

  it("refuses a first upload bigger than the whole day's bytes", async () => {
    const now = at("2026-10-25T09:15:00Z");
    expect(await countUpload("user_a", now, 1001, limits)).toBe(false);
    expect(await selectUploadUsage("user_a", now)).toEqual({
      count: 0,
      bytes: 0,
    });
  });

  it("counts each user separately", async () => {
    const now = at("2026-10-25T09:15:00Z");
    for (let i = 0; i < 3; i++) await countUpload("user_a", now, 10, limits);
    expect(await countUpload("user_a", now, 10, limits)).toBe(false);
    expect(await countUpload("user_b", now, 10, limits)).toBe(true);
  });

  it("never goes past its limits when uploads race", async () => {
    const now = at("2026-10-25T09:15:00Z");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => countUpload("user_a", now, 50, limits)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await selectUploadUsage("user_a", now)).toEqual({
      count: 3,
      bytes: 150,
    });
  });

  it("prunes the user's days from before yesterday", async () => {
    await countUpload("user_a", at("2026-10-20T09:00:00Z"), 1, limits);
    await countUpload("user_b", at("2026-10-20T09:00:00Z"), 1, limits);
    await countUpload("user_a", at("2026-10-24T09:00:00Z"), 1, limits);
    await countUpload("user_a", at("2026-10-25T09:00:00Z"), 1, limits);
    const left = await rows(
      "select user_id from receipt_upload_counts order by user_id, window_start",
    );
    expect(left.filter((r) => r.user_id === "user_a")).toHaveLength(2);
    expect(left.filter((r) => r.user_id === "user_b")).toHaveLength(1);
  });
});
