import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { getCategoryLimits } from "@/dal/category-budgets";
import { selectFixedItems } from "@/db/fixed-items";
import {
  saveRolloverRows,
  selectLimitHistory,
  selectRolloverAdjustments,
  selectRolloverSettings,
  selectSpendingByCategory,
} from "@/db/rollover";
import { isActive } from "@/lib/budget";
import { addMonths } from "@/lib/month";
import {
  adjustmentKey,
  limitIn,
  type RolloverAmount,
  type RolloverInput,
  type RolloverSettings,
  rolloverAmounts,
  rolloverOff,
} from "@/lib/rollover";

/* ---------- Reads ---------- */

/** The signed-in user's settings; off, starting at `month`, if never set. */
export const getRolloverSettings = cache(
  async (month: string): Promise<RolloverSettings> => {
    const userId = await requireUserId();
    return (await selectRolloverSettings(userId)) ?? rolloverOff(month);
  },
);

/**
 * What each budgeted category carries into `month`. Empty while rollover is
 * off or before its start month, so budgets look exactly as they did.
 */
export const getRolloverAmounts = cache(
  async (month: string): Promise<RolloverAmount[]> => {
    const settings = await getRolloverSettings(month);
    if (!settings.enabled || month < settings.startMonth) return [];

    const userId = await requireUserId();
    const lastMonth = addMonths(month, -1);
    const [limits, budgeted, fixed, spending, adjustments] = await Promise.all([
      selectLimitHistory(userId, month),
      getCategoryLimits(month),
      selectFixedItems(userId),
      selectSpendingByCategory(userId, settings.startMonth, lastMonth),
      selectRolloverAdjustments(userId, settings.startMonth, month),
    ]);

    const spent = new Map<string, number>();
    for (const row of spending) {
      spent.set(adjustmentKey(row.category, row.month), row.totalCents);
    }

    return rolloverAmounts({
      settings,
      month,
      categories: budgeted.map((l) => l.category),
      limit: (category, m) => limitIn(limits, category, m),
      // Fixed bills count as the month's cost whether or not they're marked paid.
      spent: (category, m) =>
        (spent.get(adjustmentKey(category, m)) ?? 0) +
        fixed
          .filter((f) => f.category === category && isActive(f, m))
          .reduce((total, f) => total + f.amountCents, 0),
      adjustments: new Map(
        adjustments.map((a) => [
          adjustmentKey(a.category, a.month),
          a.amountCents,
        ]),
      ),
    });
  },
);

/* ---------- Writes ---------- */

/** Saves the settings and the amounts carried into `input.month`. */
export async function saveRollover(input: RolloverInput) {
  const userId = await currentUserIdOrThrow();
  await saveRolloverRows(userId, input);
}
