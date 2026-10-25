import "server-only";
import { requireUserId } from "@/dal/auth";
import { selectMatchingExpenses } from "@/db/expense-search";
import type { ExpenseSearch } from "@/lib/schemas/expense-search";

/** Most matches listed at once; a broader search should be narrowed instead. */
export const SEARCH_RESULT_LIMIT = 200;

/**
 * The signed-in user's expenses matching a search from the Spending page: in
 * `month`, or in every month when the search asks for all of them.
 */
export async function searchExpenses(month: string, search: ExpenseSearch) {
  const userId = await requireUserId();
  return selectMatchingExpenses(userId, {
    month: search.allMonths ? null : month,
    text: search.q || null,
    category: search.category,
    minCents: search.minCents,
    maxCents: search.maxCents,
    limit: SEARCH_RESULT_LIMIT,
  });
}
