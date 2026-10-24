import { describe, expect, it } from "vitest";
import {
  SAMPLE_CATEGORIES,
  SAMPLE_EXPENSES,
  SAMPLE_FIXED,
  SAMPLE_INCOME,
  SAMPLE_TOTALS,
  shareOfIncome,
} from "@/lib/sample-month";

describe("homepage sample month", () => {
  it("adds up the deposits that have landed", () => {
    expect(SAMPLE_INCOME.filter((i) => i.amountCents === null)).toHaveLength(1);
    expect(SAMPLE_TOTALS.incomeCents).toBe(368_432);
  });

  it("adds up the fixed bills and spending", () => {
    expect(SAMPLE_FIXED).toHaveLength(5);
    expect(SAMPLE_TOTALS.fixedCents).toBe(176_029);
    expect(SAMPLE_EXPENSES).toHaveLength(3);
    expect(SAMPLE_TOTALS.spentCents).toBe(46_743);
  });

  it("leaves take-home minus fixed minus spending", () => {
    expect(SAMPLE_TOTALS.leftCents).toBe(145_660);
    expect(
      SAMPLE_TOTALS.fixedCents +
        SAMPLE_TOTALS.spentCents +
        SAMPLE_TOTALS.leftCents,
    ).toBe(SAMPLE_TOTALS.incomeCents);
  });

  it("works out shares of take-home", () => {
    expect(shareOfIncome(SAMPLE_TOTALS.incomeCents)).toBe(1);
    expect(shareOfIncome(0)).toBe(0);
  });

  it("groups everything that went out by category, largest first", () => {
    expect(SAMPLE_CATEGORIES[0]).toEqual({
      category: "Housing",
      totalCents: 145_000,
    });
    expect(SAMPLE_CATEGORIES.find((c) => c.category === "Utilities")).toEqual({
      category: "Utilities",
      totalCents: 14_500,
    });
    const total = SAMPLE_CATEGORIES.reduce((t, c) => t + c.totalCents, 0);
    expect(total).toBe(SAMPLE_TOTALS.fixedCents + SAMPLE_TOTALS.spentCents);
    const sorted = [...SAMPLE_CATEGORIES].sort(
      (a, b) => b.totalCents - a.totalCents,
    );
    expect(SAMPLE_CATEGORIES).toEqual(sorted);
  });
});
