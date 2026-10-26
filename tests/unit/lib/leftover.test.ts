import { describe, expect, it } from "vitest";
import { leftoverAppliesTo, leftoverSpend } from "@/lib/leftover";

describe("leftoverSpend", () => {
  it("is the budget's leftover when there are no chequing accounts", () => {
    expect(leftoverSpend(125_000, null)).toEqual({
      budgetLeftCents: 125_000,
      netChequingCents: null,
      leftoverCents: 125_000,
      limitedBy: "budget",
    });
    expect(leftoverSpend(-5_000, null).leftoverCents).toBe(-5_000);
  });

  it("keeps the budget's leftover when net chequing covers it", () => {
    expect(leftoverSpend(125_000, 400_000)).toMatchObject({
      leftoverCents: 125_000,
      limitedBy: "budget",
    });
  });

  it("is held to net chequing when chequing holds less", () => {
    expect(leftoverSpend(125_000, 30_000)).toMatchObject({
      leftoverCents: 30_000,
      limitedBy: "chequing",
    });
  });

  it("is zero when net chequing is zero", () => {
    expect(leftoverSpend(125_000, 0)).toMatchObject({
      leftoverCents: 0,
      limitedBy: "chequing",
    });
  });

  it("is zero, never positive, when net chequing is negative", () => {
    for (const budget of [125_000, 1, 0, -40_000]) {
      const result = leftoverSpend(budget, -1);
      expect(result.leftoverCents, String(budget)).toBe(0);
      expect(result.limitedBy).toBe("overdrawn");
    }
    expect(leftoverSpend(999_999_00, -250_00).leftoverCents).toBe(0);
  });

  it("still shows being over budget while chequing is positive", () => {
    expect(leftoverSpend(-20_000, 50_000)).toMatchObject({
      leftoverCents: -20_000,
      limitedBy: "budget",
    });
  });
});

describe("leftoverAppliesTo", () => {
  it("applies to this month and later, not to months already over", () => {
    expect(leftoverAppliesTo("2026-10", "2026-10")).toBe(true);
    expect(leftoverAppliesTo("2026-11", "2026-10")).toBe(true);
    expect(leftoverAppliesTo("2026-09", "2026-10")).toBe(false);
  });
});
