import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPLOAD_BYTES_PER_DAY,
  DEFAULT_UPLOADS_PER_DAY,
  uploadLimitMessage,
  uploadLimits,
  uploadLimitToolMessage,
  uploadRetryAfterSeconds,
  uploadWindowStart,
} from "@/lib/receipt-upload-limit";

describe("uploadLimits", () => {
  it("defaults to 200 files and 200MB a day", () => {
    expect(uploadLimits({})).toEqual({
      perDay: 200,
      bytesPerDay: 200 * 1024 * 1024,
    });
    expect(DEFAULT_UPLOADS_PER_DAY).toBe(200);
    expect(DEFAULT_UPLOAD_BYTES_PER_DAY).toBe(209_715_200);
  });

  it("takes positive whole numbers from the environment", () => {
    expect(
      uploadLimits({
        RECEIPT_UPLOADS_PER_DAY: "10",
        RECEIPT_UPLOAD_BYTES_PER_DAY: "5000000000",
      }),
    ).toEqual({ perDay: 10, bytesPerDay: 5_000_000_000 });
  });

  it("ignores values that aren't positive whole numbers", () => {
    for (const bad of ["", " ", "0", "-3", "2.5", "lots", "1e400"]) {
      expect(
        uploadLimits({
          RECEIPT_UPLOADS_PER_DAY: bad,
          RECEIPT_UPLOAD_BYTES_PER_DAY: bad,
        }),
      ).toEqual({ perDay: 200, bytesPerDay: 209_715_200 });
    }
  });
});

describe("upload windows", () => {
  it("counts per UTC day", () => {
    expect(
      uploadWindowStart(new Date("2026-10-25T23:59:59Z")).toISOString(),
    ).toBe("2026-10-25T00:00:00.000Z");
  });

  it("retries when the UTC day ends, never in less than a second", () => {
    expect(uploadRetryAfterSeconds(new Date("2026-10-25T23:00:00Z"))).toBe(
      3600,
    );
    expect(uploadRetryAfterSeconds(new Date("2026-10-25T23:59:59.999Z"))).toBe(
      1,
    );
  });
});

describe("messages", () => {
  it("says which budget ran out", () => {
    expect(uploadLimitMessage("count")).toMatch(/a lot of receipts.*tomorrow/);
    expect(uploadLimitMessage("bytes")).toMatch(/today's limit.*tomorrow/);
  });

  it("tells an AI app nothing was saved and when to try again", () => {
    expect(uploadLimitToolMessage(3600)).toMatch(
      /^Nothing was saved.*about 1 hour\./,
    );
    expect(uploadLimitToolMessage(5 * 3600 + 1)).toContain("about 6 hours");
  });
});
