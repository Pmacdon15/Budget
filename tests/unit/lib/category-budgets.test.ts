import { describe, expect, it } from "vitest";
import { CATEGORY_NAMES } from "@/lib/categories";
import {
  budgetProgress,
  budgetStatus,
  categoryBudgetsSchema,
  limitField,
} from "@/lib/category-budgets";
import type { CategoryTotal } from "@/lib/types";

const total = (
  category: string,
  fixedCents: number,
  variableCents: number,
): CategoryTotal => ({
  category,
  fixedCents,
  variableCents,
  totalCents: fixedCents + variableCents,
});

describe("categoryBudgetsSchema", () => {
  it("has one field per category", () => {
    expect(limitField("Groceries")).toBe("limit_Groceries");
    const parsed = categoryBudgetsSchema.parse({ month: "2026-10" });
    expect(parsed.limits.map((l) => l.category)).toEqual(CATEGORY_NAMES);
  });

  it("turns amounts into cents and blanks into no limit", () => {
    const parsed = categoryBudgetsSchema.parse({
      month: "2026-10",
      limit_Groceries: "600",
      limit_Dining: "$1,250.50",
      limit_Alcohol: "0",
      limit_Health: "   ",
    });
    const byCategory = Object.fromEntries(
      parsed.limits.map((l) => [l.category, l.limitCents]),
    );
    expect(byCategory).toMatchObject({
      Groceries: 60_000,
      Dining: 125_050,
      Alcohol: 0,
      Health: null,
      Housing: null,
    });
  });

  it("reports a bad amount on its own field", () => {
    const result = categoryBudgetsSchema.safeParse({
      month: "2026-10",
      limit_Groceries: "lots",
      limit_Dining: "-5",
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(["limit_Groceries", "limit_Dining"]);
    expect(result.error?.issues[0]?.message).toBe(
      "Enter a valid amount, like 300.00",
    );
  });

  it("needs a valid month", () => {
    expect(categoryBudgetsSchema.safeParse({ month: "Oct" }).success).toBe(
      false,
    );
  });
});

describe("budgetStatus", () => {
  it("is ok below 90%, near from 90% and over past the limit", () => {
    expect(budgetStatus({ spentCents: 8_999, limitCents: 10_000 })).toBe("ok");
    expect(budgetStatus({ spentCents: 9_000, limitCents: 10_000 })).toBe(
      "near",
    );
    expect(budgetStatus({ spentCents: 10_000, limitCents: 10_000 })).toBe(
      "near",
    );
    expect(budgetStatus({ spentCents: 10_001, limitCents: 10_000 })).toBe(
      "over",
    );
  });

  it("treats a $0 limit as ok until anything is spent", () => {
    expect(budgetStatus({ spentCents: 0, limitCents: 0 })).toBe("ok");
    expect(budgetStatus({ spentCents: 1, limitCents: 0 })).toBe("over");
  });
});

describe("budgetProgress", () => {
  it("counts fixed bills and spending, most used first", () => {
    const progress = budgetProgress(
      [
        { category: "Groceries", limitCents: 60_000 },
        { category: "Housing", limitCents: 150_000 },
        { category: "Dining", limitCents: 20_000 },
      ],
      [
        total("Housing", 150_000, 0),
        total("Groceries", 0, 30_000),
        total("Dining", 0, 25_000),
        total("Auto", 10_000, 0),
      ],
    );
    expect(progress).toEqual([
      {
        category: "Dining",
        limitCents: 20_000,
        spentCents: 25_000,
        fixedCents: 0,
        leftCents: -5_000,
        usage: 1.25,
      },
      {
        category: "Housing",
        limitCents: 150_000,
        spentCents: 150_000,
        fixedCents: 150_000,
        leftCents: 0,
        usage: 1,
      },
      {
        category: "Groceries",
        limitCents: 60_000,
        spentCents: 30_000,
        fixedCents: 0,
        leftCents: 30_000,
        usage: 0.5,
      },
    ]);
  });

  it("shows a limited category with nothing spent yet", () => {
    expect(
      budgetProgress([{ category: "Health", limitCents: 5_000 }], []),
    ).toEqual([
      {
        category: "Health",
        limitCents: 5_000,
        spentCents: 0,
        fixedCents: 0,
        leftCents: 5_000,
        usage: 0,
      },
    ]);
  });

  it("puts spending against a $0 limit at the top", () => {
    const progress = budgetProgress(
      [
        { category: "Groceries", limitCents: 60_000 },
        { category: "Alcohol", limitCents: 0 },
      ],
      [total("Groceries", 0, 59_000), total("Alcohol", 0, 1_000)],
    );
    expect(progress.map((p) => p.category)).toEqual(["Alcohol", "Groceries"]);
  });
});
