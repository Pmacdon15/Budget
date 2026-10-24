import "server-only";
import { cache } from "react";
import { requireUserId } from "@/dal/auth";
import { selectExpensesBetween } from "@/db/expenses";
import { selectFixedItems } from "@/db/fixed-items";
import { selectIncomeBetween } from "@/db/income";
import { categoryTotals, isActive, sum, totalsFor } from "@/lib/budget";
import { addMonths, monthRange } from "@/lib/month";

/**
 * Everything the dashboard and report need for one month, plus a 12-month history.
 * Pages read it from several small `<Suspense>` holes; `cache` makes them share
 * one set of queries per request.
 */
export function getMonthOverview(month: string, historyMonths = 12) {
  return loadMonthOverview(month, historyMonths);
}

const loadMonthOverview = cache(
  async (month: string, historyMonths: number) => {
    const userId = await requireUserId();
    const months = monthRange(month, historyMonths);
    const from = months[0];

    const [fixed, income, expenses] = await Promise.all([
      selectFixedItems(userId),
      selectIncomeBetween(userId, from, month),
      selectExpensesBetween(userId, from, month),
    ]);

    const history = months.map((m) => totalsFor(m, fixed, income, expenses));
    const current = history[history.length - 1];
    const previous =
      history[history.length - 2] ??
      totalsFor(addMonths(month, -1), [], [], []);

    // Rolling take-home: average of the last 3 months that actually have income recorded.
    const withIncome = history.filter((h) => h.incomeCents > 0).slice(-3);
    const rollingIncomeCents =
      withIncome.length > 0
        ? Math.round(
            sum(withIncome.map((h) => h.incomeCents)) / withIncome.length,
          )
        : 0;

    return {
      month,
      current,
      previous,
      history,
      rollingIncomeCents,
      categories: categoryTotals(month, fixed, expenses),
      fixedItems: fixed.filter((f) => isActive(f, month)),
      income: income.filter((i) => i.month === month),
      expenses: expenses.filter((e) => e.month === month),
    };
  },
);

export type MonthOverview = Awaited<ReturnType<typeof getMonthOverview>>;
