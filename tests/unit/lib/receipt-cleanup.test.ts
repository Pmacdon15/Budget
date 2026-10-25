import { describe, expect, it } from "vitest";
import {
  isAuthorizedCronRequest,
  isOldEnoughToRemove,
  UNATTACHED_PHOTO_MAX_AGE_MS,
} from "@/lib/receipt-cleanup";

describe("isAuthorizedCronRequest", () => {
  const SECRET = "a-long-random-cron-secret";

  it("accepts Vercel Cron's bearer token", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["a wrong secret", "Bearer not-the-secret"],
    ["the secret without Bearer", SECRET],
    ["a different scheme", `Basic ${SECRET}`],
    ["a longer value", `Bearer ${SECRET}x`],
    ["an empty header", ""],
  ])("refuses %s", (_label, header) => {
    expect(isAuthorizedCronRequest(header, SECRET)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});

describe("isOldEnoughToRemove", () => {
  const now = new Date("2026-10-26T09:17:00Z");

  it("keeps a photo younger than a day, since a form may still save it", () => {
    const young = new Date(now.getTime() - UNATTACHED_PHOTO_MAX_AGE_MS + 1);
    expect(isOldEnoughToRemove(young, now)).toBe(false);
    expect(isOldEnoughToRemove(now, now)).toBe(false);
  });

  it("allows removing a photo once it is a day old", () => {
    const old = new Date(now.getTime() - UNATTACHED_PHOTO_MAX_AGE_MS);
    expect(isOldEnoughToRemove(old, now)).toBe(true);
    expect(isOldEnoughToRemove(new Date("2026-01-01"), now)).toBe(true);
  });
});
