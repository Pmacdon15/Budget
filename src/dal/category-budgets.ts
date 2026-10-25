import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { getMonthOverview } from "@/dal/overview";
import {
  selectCategoryLimits,
  upsertCategoryLimits,
} from "@/db/category-budgets";
import {
  type BudgetProgress,
  budgetProgress,
  type CategoryBudgetsInput,
  type CategoryLimit,
} from "@/lib/category-budgets";

/* ---------- Reads ---------- */

/** The limits in force in `month`, for the signed-in user. */
export const getCategoryLimits = cache(
  async (month: string): Promise<CategoryLimit[]> => {
    const userId = await requireUserId();
    const stored = await selectCategoryLimits(userId, month);
    return stored.flatMap(({ category, limitCents }) =>
      limitCents == null ? [] : [{ category, limitCents }],
    );
  },
);

/**
 * Each limited category's progress in `month`. `historyMonths` should match
 * what the page already loads, so the overview read is shared, not repeated.
 */
export async function getBudgetProgress(
  month: string,
  historyMonths = 12,
): Promise<BudgetProgress[]> {
  const [limits, overview] = await Promise.all([
    getCategoryLimits(month),
    getMonthOverview(month, historyMonths),
  ]);
  return budgetProgress(limits, overview.categories);
}

/* ---------- Writes ---------- */

/**
 * Sets limits from `input.month` onward. Only categories whose limit actually
 * changes get a row, so saving the form unchanged writes nothing.
 */
export async function setCategoryBudgets(input: CategoryBudgetsInput) {
  const userId = await currentUserIdOrThrow();
  const current = new Map(
    (await selectCategoryLimits(userId, input.month)).map((l) => [
      l.category,
      l.limitCents,
    ]),
  );
  const changed = input.limits.filter(
    ({ category, limitCents }) =>
      (current.get(category) ?? null) !== limitCents,
  );
  await upsertCategoryLimits(userId, input.month, changed);
}
