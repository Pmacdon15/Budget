import "server-only";
import { cache } from "react";
import { requireUserId } from "@/dal/auth";
import { selectExpensesBetween } from "@/db/expenses";
import { selectFixedItems } from "@/db/fixed-items";
import { selectIncomeBetween } from "@/db/income";
import { requestMonth } from "@/lib/now";
import { buildYearReport } from "@/lib/year-view";

/**
 * The year view for the signed-in user: `year` up to `through` (default: this
 * month), plus the same months of the year before. The page reads it from
 * several small `<Suspense>` holes; `cache` makes them share one set of
 * queries per request.
 */
export async function getYearReport(year: number, through?: string) {
  return loadYearReport(year, through ?? (await requestMonth()));
}

const loadYearReport = cache(async (year: number, through: string) => {
  const userId = await requireUserId();
  const from = `${year - 1}-01`;
  const to = `${year}-12`;

  const [fixed, income, expenses] = await Promise.all([
    selectFixedItems(userId),
    selectIncomeBetween(userId, from, to),
    selectExpensesBetween(userId, from, to),
  ]);

  return buildYearReport(year, through, fixed, income, expenses);
});
