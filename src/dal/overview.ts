import "server-only";
import { cache } from "react";
import { requireUserId } from "@/dal/auth";
import { selectAccounts } from "@/db/accounts";
import { selectExpensesBetween } from "@/db/expenses";
import { selectFixedItems } from "@/db/fixed-items";
import { selectIncomeBetween } from "@/db/income";
import { netChequingCents } from "@/lib/accounts";
import { categoryTotals, isActive, sum, totalsFor } from "@/lib/budget";
import { leftoverAppliesTo, leftoverSpend } from "@/lib/leftover";
import { addMonths, currentMonth, monthRange } from "@/lib/month";
import { requestMonth } from "@/lib/now";

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
    return buildMonthOverview(
      userId,
      month,
      historyMonths,
      await requestMonth(),
    );
  },
);

/**
 * The overview for `userId`, without the session check: the DAL above uses
 * it for the signed-in user, and the MCP tools for the verified caller.
 *
 * "Left over" for this month (and later ones) is leftover spend: the budget's
 * leftover held to what's in the user's chequing accounts combined, and 0
 * while chequing is negative (see src/lib/leftover.ts). It's fixed here, at
 * the source, so the overview, report, CSV export and MCP output all agree.
 * Months already over keep what was really left over then.
 */
export async function buildMonthOverview(
  userId: string,
  month: string,
  historyMonths = 12,
  thisMonth = currentMonth(),
) {
  const months = monthRange(month, historyMonths);
  const from = months[0];

  const [fixed, income, expenses, accounts] = await Promise.all([
    selectFixedItems(userId),
    selectIncomeBetween(userId, from, month),
    selectExpensesBetween(userId, from, month),
    selectAccounts(userId),
  ]);

  const history = months.map((m) => totalsFor(m, fixed, income, expenses));
  const budget = history[history.length - 1] ?? totalsFor(month, [], [], []);
  const leftover = leftoverSpend(
    budget.netCents,
    leftoverAppliesTo(month, thisMonth) ? netChequingCents(accounts) : null,
  );
  const current = { ...budget, netCents: leftover.leftoverCents };
  history[history.length - 1] = current;
  const previous =
    history[history.length - 2] ?? totalsFor(addMonths(month, -1), [], [], []);

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
    leftover,
    rollingIncomeCents,
    categories: categoryTotals(month, fixed, expenses),
    fixedItems: fixed.filter((f) => isActive(f, month)),
    income: income.filter((i) => i.month === month),
    expenses: expenses.filter((e) => e.month === month),
  };
}

export type MonthOverview = Awaited<ReturnType<typeof getMonthOverview>>;
