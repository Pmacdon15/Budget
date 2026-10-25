import "server-only";
import { db } from "@/db/client";

/** Raw SQL for the category_budgets table. Callers (the DAL) handle auth and rules. */

export type StoredLimit = { category: string; limitCents: number | null };

/**
 * The limit in force for each category in `month`: the latest row starting on
 * or before it. Categories whose latest row cleared the limit come back with
 * `limitCents: null`.
 */
export async function selectCategoryLimits(
  userId: string,
  month: string,
): Promise<StoredLimit[]> {
  const rows = await db()`
    select distinct on (category) category, amount_cents
    from category_budgets
    where user_id = ${userId} and start_month <= ${month}
    order by category, start_month desc
  `;
  return rows.map((r) => ({
    category: String(r.category),
    limitCents: r.amount_cents == null ? null : Number(r.amount_cents),
  }));
}

/** Sets each category's limit from `month` onward, in one transaction. */
export async function upsertCategoryLimits(
  userId: string,
  month: string,
  limits: StoredLimit[],
) {
  if (limits.length === 0) return;
  await db().transaction((sql) =>
    limits.map(
      ({ category, limitCents }) => sql`
        insert into category_budgets (user_id, category, start_month, amount_cents)
        values (${userId}, ${category}, ${month}, ${limitCents})
        on conflict (user_id, category, start_month)
        do update set amount_cents = excluded.amount_cents
      `,
    ),
  );
}
