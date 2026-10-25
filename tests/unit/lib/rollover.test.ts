import { describe, expect, it } from "vitest";
import type { BudgetProgress } from "@/lib/category-budgets";
import {
  adjustmentKey,
  applyRollover,
  type LimitRow,
  limitIn,
  type RolloverSettings,
  rolloverAmounts,
  rolloverOff,
  rolloverSchema,
} from "@/lib/rollover";

const on = (startMonth: string, excluded: string[] = []): RolloverSettings => ({
  enabled: true,
  startMonth,
  excluded,
});

/** Groceries: $600 a month; spending per month from `spent`. */
const run = (
  settings: RolloverSettings,
  month: string,
  spent: Record<string, number> = {},
  adjustments: Record<string, number> = {},
  categories = ["Groceries"],
) =>
  rolloverAmounts({
    settings,
    month,
    categories,
    limit: () => 60_000,
    spent: (category, m) => spent[adjustmentKey(category, m)] ?? 0,
    adjustments: new Map(Object.entries(adjustments)),
  });

describe("rolloverAmounts", () => {
  it("carries nothing while rollover is off", () => {
    expect(
      run(rolloverOff("2026-01"), "2026-10", { "Groceries|2026-09": 10_000 }),
    ).toEqual([]);
  });

  it("carries nothing before the start month", () => {
    expect(run(on("2026-10"), "2026-09")).toEqual([]);
  });

  it("carries nothing into the start month unless it's set by hand", () => {
    expect(run(on("2026-10"), "2026-10")).toEqual([
      {
        category: "Groceries",
        carriedCents: 0,
        calculatedCents: 0,
        adjusted: false,
      },
    ]);
    expect(
      run(on("2026-10"), "2026-10", {}, { "Groceries|2026-10": 12_345 }),
    ).toEqual([
      {
        category: "Groceries",
        carriedCents: 12_345,
        calculatedCents: 0,
        adjusted: true,
      },
    ]);
  });

  it("ignores what happened before the start month", () => {
    const [amount] = run(on("2026-09"), "2026-10", {
      "Groceries|2026-08": 0, // a whole unspent month, before the start
      "Groceries|2026-09": 50_000,
    });
    expect(amount?.carriedCents).toBe(10_000);
  });

  it("builds up month after month", () => {
    const [amount] = run(on("2026-08"), "2026-10", {
      "Groceries|2026-08": 50_000, // $100 left
      "Groceries|2026-09": 55_000, // $600 + $100 - $550 = $150 left
    });
    expect(amount).toMatchObject({ carriedCents: 15_000, adjusted: false });
  });

  it("never carries a negative amount after an overspent month", () => {
    const [amount] = run(on("2026-09"), "2026-10", {
      "Groceries|2026-09": 80_000,
    });
    expect(amount?.carriedCents).toBe(0);
  });

  it("lets a hand-set amount replace the calculated one, and later months build on it", () => {
    const spent = {
      "Groceries|2026-08": 50_000,
      "Groceries|2026-09": 60_000,
    };
    // Calculated: $100 into Sept, then $100 into Oct.
    expect(run(on("2026-08"), "2026-10", spent)[0]?.carriedCents).toBe(10_000);

    // The user knows only $20 was really left at the end of August.
    const adjusted = { "Groceries|2026-09": 2_000 };
    expect(run(on("2026-08"), "2026-09", spent, adjusted)[0]).toEqual({
      category: "Groceries",
      carriedCents: 2_000,
      calculatedCents: 10_000,
      adjusted: true,
    });
    expect(run(on("2026-08"), "2026-10", spent, adjusted)[0]).toMatchObject({
      carriedCents: 2_000,
      adjusted: false,
    });
  });

  it("leaves out excluded categories", () => {
    const amounts = run(on("2026-09", ["Dining"]), "2026-10", {}, {}, [
      "Groceries",
      "Dining",
    ]);
    expect(amounts.map((a) => a.category)).toEqual(["Groceries"]);
  });
});

describe("limitIn", () => {
  const rows: LimitRow[] = [
    { category: "Groceries", startMonth: "2026-01", limitCents: 50_000 },
    { category: "Groceries", startMonth: "2026-06", limitCents: 60_000 },
    { category: "Dining", startMonth: "2026-01", limitCents: 20_000 },
    { category: "Dining", startMonth: "2026-05", limitCents: null },
  ];

  it("uses the latest limit starting on or before the month", () => {
    expect(limitIn(rows, "Groceries", "2025-12")).toBe(0);
    expect(limitIn(rows, "Groceries", "2026-05")).toBe(50_000);
    expect(limitIn(rows, "Groceries", "2026-06")).toBe(60_000);
  });

  it("treats a cleared limit as zero", () => {
    expect(limitIn(rows, "Dining", "2026-04")).toBe(20_000);
    expect(limitIn(rows, "Dining", "2026-07")).toBe(0);
  });
});

describe("applyRollover", () => {
  const row: BudgetProgress = {
    category: "Groceries",
    limitCents: 60_000,
    spentCents: 63_000,
    fixedCents: 0,
    leftCents: -3_000,
    usage: 1.05,
  };

  it("adds what was carried in to what's left", () => {
    const [rolled] = applyRollover(
      [row],
      [
        {
          category: "Groceries",
          carriedCents: 10_000,
          calculatedCents: 10_000,
          adjusted: false,
        },
      ],
    );
    expect(rolled).toMatchObject({
      limitCents: 60_000,
      carriedCents: 10_000,
      availableCents: 70_000,
      leftCents: 7_000,
      usage: 0.9,
    });
  });

  it("changes nothing without rollover", () => {
    expect(applyRollover([row], [])).toEqual([
      { ...row, carriedCents: 0, availableCents: 60_000 },
    ]);
  });
});

describe("rolloverSchema", () => {
  const base = {
    month: "2026-10",
    startMonth: "2026-09",
    categories: "Groceries,Dining",
  };

  it("reads the settings, ticked categories and hand-set amounts", () => {
    expect(
      rolloverSchema.parse({
        ...base,
        enabled: "on",
        rollover_Groceries: "on",
        carry_Groceries: "45.50",
        carry_Dining: "",
      }),
    ).toEqual({
      month: "2026-10",
      enabled: true,
      startMonth: "2026-09",
      categories: [
        { category: "Groceries", included: true, carriedCents: 4_550 },
        { category: "Dining", included: false, carriedCents: null },
      ],
    });
  });

  it("is off when the box is unticked", () => {
    expect(rolloverSchema.parse(base).enabled).toBe(false);
  });

  it("rejects a bad amount on its own field", () => {
    const result = rolloverSchema.safeParse({ ...base, carry_Dining: "lots" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["carry_Dining"],
      message: "Enter a valid amount, like 50.00",
    });
  });

  it("rejects a missing start month and unknown categories", () => {
    expect(
      rolloverSchema.safeParse({ ...base, startMonth: "" }).error?.issues[0]
        ?.message,
    ).toBe("Pick the month rollover starts from");
    expect(
      rolloverSchema.safeParse({ ...base, categories: "Groceries,Yachts" })
        .success,
    ).toBe(false);
  });
});
