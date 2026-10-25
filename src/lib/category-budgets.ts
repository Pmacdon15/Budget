import { z } from "zod";
import { CATEGORY_NAMES, type Category } from "@/lib/categories";
import { parseMoney } from "@/lib/money";
import { monthSchema } from "@/lib/schemas";
import type { CategoryTotal } from "@/lib/types";

/*
 * Category budgets: a monthly limit per category, compared with everything in
 * that category for the month (fixed bills and spending together). Shared by
 * the browser and the server.
 */

/** The form field for one category's limit, e.g. `limit_Groceries`. */
export const limitField = (category: Category) => `limit_${category}` as const;

const optionalLimit = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const cents = parseMoney(trimmed);
    if (cents === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid amount, like 300.00",
      });
      return z.NEVER;
    }
    return cents;
  });

const limitFields = Object.fromEntries(
  CATEGORY_NAMES.map((category) => [limitField(category), optionalLimit]),
) as Record<ReturnType<typeof limitField>, typeof optionalLimit>;

/**
 * The "Set budgets" form: one optional amount per category. Blank means no
 * limit. Limits apply from `month` onward, so earlier months keep theirs.
 */
export const categoryBudgetsSchema = z
  .object({ month: monthSchema, ...limitFields })
  .transform(({ month, ...values }) => ({
    month,
    limits: CATEGORY_NAMES.map((category) => ({
      category,
      limitCents: values[limitField(category)] ?? null,
    })),
  }));

export type CategoryBudgetsFormValues = z.input<typeof categoryBudgetsSchema>;
export type CategoryBudgetsInput = z.output<typeof categoryBudgetsSchema>;

export type CategoryLimit = { category: string; limitCents: number };

export type BudgetProgress = {
  category: string;
  limitCents: number;
  /** Fixed bills plus spending in the category this month. */
  spentCents: number;
  fixedCents: number;
  /** Negative when over the limit. */
  leftCents: number;
  /** spent / limit; 0 for a $0 limit with nothing spent. */
  usage: number;
};

export type BudgetStatus = "ok" | "near" | "over";

/** Near the limit from 90% used, like the take-home bar on the overview. */
export function budgetStatus({
  spentCents,
  limitCents,
}: Pick<BudgetProgress, "spentCents" | "limitCents">): BudgetStatus {
  if (spentCents > limitCents) return "over";
  if (limitCents > 0 && spentCents >= limitCents * 0.9) return "near";
  return "ok";
}

/** Each limited category's progress, most used first. */
export function budgetProgress(
  limits: CategoryLimit[],
  totals: CategoryTotal[],
): BudgetProgress[] {
  const byCategory = new Map(totals.map((t) => [t.category, t]));
  return limits
    .map(({ category, limitCents }) => {
      const total = byCategory.get(category);
      const spentCents = total?.totalCents ?? 0;
      return {
        category,
        limitCents,
        spentCents,
        fixedCents: total?.fixedCents ?? 0,
        leftCents: limitCents - spentCents,
        usage:
          limitCents > 0
            ? spentCents / limitCents
            : spentCents > 0
              ? Number.POSITIVE_INFINITY
              : 0,
      };
    })
    .sort((a, b) => b.usage - a.usage || a.category.localeCompare(b.category));
}
