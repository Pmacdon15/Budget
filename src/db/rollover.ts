import "server-only";
import { db } from "@/db/client";
import type { LimitRow, RolloverSettings } from "@/lib/rollover";

/** Raw SQL for rolling over unspent budget. Callers (the DAL) handle auth and rules. */

/** The user's rollover settings, or null if they never turned it on. */
export async function selectRolloverSettings(
  userId: string,
): Promise<RolloverSettings | null> {
  const [settings] = await db()`
    select enabled, start_month from rollover_settings where user_id = ${userId}
  `;
  if (!settings) return null;
  const excluded = await db()`
    select category from rollover_excluded_categories
    where user_id = ${userId}
    order by category
  `;
  return {
    enabled: Boolean(settings.enabled),
    startMonth: String(settings.start_month),
    excluded: excluded.map((r) => String(r.category)),
  };
}

/** Every category limit that starts on or before `month`. */
export async function selectLimitHistory(
  userId: string,
  month: string,
): Promise<LimitRow[]> {
  const rows = await db()`
    select category, start_month, amount_cents
    from category_budgets
    where user_id = ${userId} and start_month <= ${month}
  `;
  return rows.map((r) => ({
    category: String(r.category),
    startMonth: String(r.start_month),
    limitCents: r.amount_cents == null ? null : Number(r.amount_cents),
  }));
}

/** Spending (not fixed bills) per category per month, `from` to `to` inclusive. */
export async function selectSpendingByCategory(
  userId: string,
  from: string,
  to: string,
) {
  const rows = await db()`
    select month, category, sum(amount_cents)::bigint as total
    from expenses
    where user_id = ${userId} and month between ${from} and ${to}
      and fixed_item_id is null
    group by month, category
  `;
  return rows.map((r) => ({
    month: String(r.month),
    category: String(r.category),
    totalCents: Number(r.total),
  }));
}

/** Hand-set carried amounts from `from` to `to` inclusive. */
export async function selectRolloverAdjustments(
  userId: string,
  from: string,
  to: string,
) {
  const rows = await db()`
    select category, month, amount_cents
    from rollover_adjustments
    where user_id = ${userId} and month between ${from} and ${to}
  `;
  return rows.map((r) => ({
    category: String(r.category),
    month: String(r.month),
    amountCents: Number(r.amount_cents),
  }));
}

/**
 * Saves the settings, which categories are left out (of those `shown`), and
 * this month's hand-set amounts (null removes one), in one transaction.
 */
export async function saveRolloverRows(
  userId: string,
  values: {
    enabled: boolean;
    startMonth: string;
    month: string;
    categories: {
      category: string;
      included: boolean;
      carriedCents: number | null;
    }[];
  },
) {
  await db().transaction((sql) => [
    sql`
      insert into rollover_settings (user_id, enabled, start_month)
      values (${userId}, ${values.enabled}, ${values.startMonth})
      on conflict (user_id) do update
      set enabled = excluded.enabled,
          start_month = excluded.start_month,
          updated_at = now()
    `,
    ...values.categories.flatMap(({ category, included, carriedCents }) => [
      included
        ? sql`
            delete from rollover_excluded_categories
            where user_id = ${userId} and category = ${category}
          `
        : sql`
            insert into rollover_excluded_categories (user_id, category)
            values (${userId}, ${category})
            on conflict do nothing
          `,
      carriedCents === null
        ? sql`
            delete from rollover_adjustments
            where user_id = ${userId} and category = ${category}
              and month = ${values.month}
          `
        : sql`
            insert into rollover_adjustments (user_id, category, month, amount_cents)
            values (${userId}, ${category}, ${values.month}, ${carriedCents})
            on conflict (user_id, category, month) do update
            set amount_cents = excluded.amount_cents, updated_at = now()
          `,
    ]),
  ]);
}
