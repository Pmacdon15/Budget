import { describe, expect, it } from "vitest";
import { categoryTotals, isActive, sum, totalsFor } from "@/lib/budget";
import { expense, fixedItem, incomeEntry } from "../../helpers/fixtures";

describe("sum", () => {
  it("adds numbers and treats an empty list as zero", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
  });
});

describe("isActive", () => {
  const item = { startMonth: "2026-03", endMonth: "2026-06" };

  it("is active from its start month through its end month", () => {
    expect(isActive(item, "2026-03")).toBe(true);
    expect(isActive(item, "2026-05")).toBe(true);
    expect(isActive(item, "2026-06")).toBe(true);
  });

  it("is inactive before it starts and after it ends", () => {
    expect(isActive(item, "2026-02")).toBe(false);
    expect(isActive(item, "2026-07")).toBe(false);
  });

  it("runs forever when it has no end month", () => {
    expect(isActive({ startMonth: "2026-03", endMonth: null }, "2099-12")).toBe(
      true,
    );
  });

  it("compares across year boundaries", () => {
    expect(isActive({ startMonth: "2025-12", endMonth: null }, "2026-01")).toBe(
      true,
    );
    expect(isActive({ startMonth: "2026-01", endMonth: null }, "2025-12")).toBe(
      false,
    );
  });
});

describe("totalsFor", () => {
  const fixed = [
    fixedItem({ amountCents: 150_000 }),
    fixedItem({ name: "Phone", category: "Utilities", amountCents: 6_000 }),
    fixedItem({ name: "Old gym", amountCents: 5_000, endMonth: "2026-09" }),
    fixedItem({ name: "Future", amountCents: 9_999, startMonth: "2026-11" }),
  ];
  const income = [
    incomeEntry({ amountCents: 250_000 }),
    incomeEntry({ amountCents: 50_000 }),
    incomeEntry({ month: "2026-09", amountCents: 1 }),
  ];
  const expenses = [
    expense({ amountCents: 10_000 }),
    expense({ amountCents: 2_500 }),
    expense({ month: "2026-09", amountCents: 7 }),
  ];

  it("totals only the given month, counting active fixed bills", () => {
    expect(totalsFor("2026-10", fixed, income, expenses)).toEqual({
      month: "2026-10",
      incomeCents: 300_000,
      fixedCents: 156_000,
      variableCents: 12_500,
      spentCents: 168_500,
      netCents: 131_500,
    });
  });

  it("goes negative when spending beats take-home", () => {
    const totals = totalsFor("2026-10", fixed, [], expenses);
    expect(totals.incomeCents).toBe(0);
    expect(totals.netCents).toBe(-168_500);
  });

  it("is all zeros for an empty month", () => {
    expect(totalsFor("2020-01", [], [], [])).toEqual({
      month: "2020-01",
      incomeCents: 0,
      fixedCents: 0,
      variableCents: 0,
      spentCents: 0,
      netCents: 0,
    });
  });
});

describe("categoryTotals", () => {
  it("merges fixed and variable spending per category, largest first", () => {
    const fixed = [
      fixedItem({ category: "Housing", amountCents: 150_000 }),
      fixedItem({ category: "Groceries", amountCents: 1_000 }),
      fixedItem({ category: "Debt", amountCents: 99, endMonth: "2026-01" }),
    ];
    const expenses = [
      expense({ category: "Groceries", amountCents: 20_000 }),
      expense({ category: "Dining", amountCents: 3_000 }),
      expense({ category: "Dining", amountCents: 500, month: "2026-09" }),
    ];

    expect(categoryTotals("2026-10", fixed, expenses)).toEqual([
      {
        category: "Housing",
        fixedCents: 150_000,
        variableCents: 0,
        totalCents: 150_000,
      },
      {
        category: "Groceries",
        fixedCents: 1_000,
        variableCents: 20_000,
        totalCents: 21_000,
      },
      {
        category: "Dining",
        fixedCents: 0,
        variableCents: 3_000,
        totalCents: 3_000,
      },
    ]);
  });

  it("returns nothing when nothing was spent", () => {
    expect(categoryTotals("2026-10", [], [])).toEqual([]);
  });
});
