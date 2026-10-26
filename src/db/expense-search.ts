import "server-only";
import { db } from "@/db/client";
import { toExpense } from "@/db/expenses";
import type { Expense } from "@/lib/types";

/** Raw SQL for searching expenses. Callers (the DAL) handle auth and rules. */

export type ExpenseFilters = {
  /** Only this month (`YYYY-MM`), or every month when null. */
  month: string | null;
  /** Matched anywhere in the description or the receipt's merchant, ignoring case. */
  text: string | null;
  category: string | null;
  minCents: number | null;
  maxCents: number | null;
  limit: number;
};

/** Escapes `%`, `_` and `\` so search text matches literally inside `ilike`. */
export function likePattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** This user's expenses matching every filter that is set, newest first. */
export async function selectMatchingExpenses(
  userId: string,
  filters: ExpenseFilters,
): Promise<Expense[]> {
  const pattern = filters.text ? likePattern(filters.text) : null;
  const rows = await db()`
    select e.id, e.month, e.spent_on, e.description, e.category,
           e.amount_cents, e.receipt_id, e.unpaid,
           (r.image_pathname is not null) as receipt_has_photo
    from expenses e
    left join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
    where e.user_id = ${userId}
      and (${filters.month}::text is null or e.month = ${filters.month})
      and (${pattern}::text is null
           or e.description ilike ${pattern}
           or r.merchant ilike ${pattern})
      and (${filters.category}::text is null or e.category = ${filters.category})
      and (${filters.minCents}::int is null or e.amount_cents >= ${filters.minCents})
      and (${filters.maxCents}::int is null or e.amount_cents <= ${filters.maxCents})
    order by e.spent_on desc, e.created_at desc
    limit ${filters.limit}
  `;
  return rows.map(toExpense);
}
