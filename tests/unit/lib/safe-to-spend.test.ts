import { describe, expect, it } from "vitest";
import { daysLeftInMonth, safeToSpend } from "@/lib/safe-to-spend";

describe("daysLeftInMonth", () => {
  it("counts today in the current month", () => {
    expect(daysLeftInMonth("2026-10", "2026-10-01")).toBe(31);
    expect(daysLeftInMonth("2026-10", "2026-10-25")).toBe(7);
    expect(daysLeftInMonth("2026-10", "2026-10-31")).toBe(1);
    expect(daysLeftInMonth("2028-02", "2028-02-28")).toBe(2); // leap year
  });

  it("gives a future month all its days and a past month none", () => {
    expect(daysLeftInMonth("2026-11", "2026-10-25")).toBe(30);
    expect(daysLeftInMonth("2026-09", "2026-10-25")).toBe(0);
    expect(daysLeftInMonth("2025-12", "2026-01-01")).toBe(0);
  });
});

describe("safeToSpend", () => {
  it("spreads what's left over the days left, rounding down", () => {
    expect(
      safeToSpend({ incomeCents: 300_000, spentCents: 175_000, daysLeft: 7 }),
    ).toEqual({ leftCents: 125_000, daysLeft: 7, perDayCents: 17_857 });
  });

  it("is zero per day when nothing is left", () => {
    expect(
      safeToSpend({ incomeCents: 100_000, spentCents: 100_000, daysLeft: 5 }),
    ).toEqual({ leftCents: 0, daysLeft: 5, perDayCents: 0 });
    expect(
      safeToSpend({ incomeCents: 100_000, spentCents: 120_000, daysLeft: 5 }),
    ).toEqual({ leftCents: -20_000, daysLeft: 5, perDayCents: 0 });
  });

  it("has no per-day amount once the month is over", () => {
    expect(
      safeToSpend({ incomeCents: 100_000, spentCents: 0, daysLeft: 0 }),
    ).toMatchObject({ perDayCents: 0 });
  });
});

describe("safeToSpend held to net chequing", () => {
  const month = { incomeCents: 300_000, spentCents: 175_000, daysLeft: 5 };

  it("is unchanged with no chequing accounts", () => {
    expect(safeToSpend({ ...month, netChequingCents: null })).toEqual({
      leftCents: 125_000,
      daysLeft: 5,
      perDayCents: 25_000,
    });
  });

  it("is zero, never positive, when net chequing is negative", () => {
    expect(safeToSpend({ ...month, netChequingCents: -1 })).toEqual({
      leftCents: 0,
      daysLeft: 5,
      perDayCents: 0,
    });
    expect(
      safeToSpend({ ...month, netChequingCents: -50_000 }).perDayCents,
    ).toBe(0);
  });

  it("is zero when net chequing is zero", () => {
    expect(safeToSpend({ ...month, netChequingCents: 0 })).toMatchObject({
      leftCents: 0,
      perDayCents: 0,
    });
  });

  it("spreads only what chequing holds when that's less than the budget", () => {
    expect(safeToSpend({ ...month, netChequingCents: 10_000 })).toEqual({
      leftCents: 10_000,
      daysLeft: 5,
      perDayCents: 2_000,
    });
  });

  it("keeps the budget when chequing covers it", () => {
    expect(
      safeToSpend({ ...month, netChequingCents: 1_000_000 }).perDayCents,
    ).toBe(25_000);
  });
});
