import "server-only";
import { db, type Row } from "@/db/client";
import type { FixedItem } from "@/lib/types";

/** Raw SQL for the fixed_items table. Callers (the DAL) handle auth and rules. */

type FixedItemValues = {
  name: string;
  category: string;
  amountCents: number;
  dueDay: number | null;
};

/** How a charge for the bill shows up, and whether the amount is a guess. */
export type FixedItemMatchValues = {
  merchant?: string | null;
  matchKeywords?: string[];
  isEstimate?: boolean;
};

const toFixedItem = (r: Row): FixedItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  amountCents: Number(r.amount_cents),
  dueDay: r.due_day == null ? null : Number(r.due_day),
  startMonth: String(r.start_month),
  endMonth: r.end_month == null ? null : String(r.end_month),
  merchant: r.merchant ?? null,
  matchKeywords: Array.isArray(r.match_keywords)
    ? r.match_keywords.map(String)
    : [],
  isEstimate: Boolean(r.is_estimate),
  seriesId: String(r.series_id ?? r.id),
});

export async function selectFixedItems(userId: string): Promise<FixedItem[]> {
  const rows = await db()`
    select id, name, category, amount_cents, due_day, start_month, end_month,
           merchant, match_keywords, is_estimate, series_id
    from fixed_items
    where user_id = ${userId}
    order by start_month desc, name asc
  `;
  return rows.map(toFixedItem);
}

export async function selectFixedItem(
  userId: string,
  id: string,
): Promise<FixedItem | null> {
  const [row] = await db()`
    select id, name, category, amount_cents, due_day, start_month, end_month,
           merchant, match_keywords, is_estimate, series_id
    from fixed_items
    where id = ${id} and user_id = ${userId}
  `;
  return row ? toFixedItem(row) : null;
}

/**
 * The row of the bill `id` belongs to that is active in `month`: after an
 * amount change a bill is several rows, one per stretch of months.
 */
export async function selectFixedItemInMonth(
  userId: string,
  id: string,
  month: string,
): Promise<FixedItem | null> {
  const [row] = await db()`
    select f.id, f.name, f.category, f.amount_cents, f.due_day, f.start_month,
           f.end_month, f.merchant, f.match_keywords, f.is_estimate, f.series_id
    from fixed_items f
    join fixed_items picked on picked.id = ${id} and picked.user_id = ${userId}
    where f.user_id = ${userId}
      and coalesce(f.series_id, f.id) = coalesce(picked.series_id, picked.id)
      and f.start_month <= ${month}
      and (f.end_month is null or f.end_month >= ${month})
    order by f.start_month desc
    limit 1
  `;
  return row ? toFixedItem(row) : null;
}

/** Returns the new item's id. */
export async function insertFixedItem(
  userId: string,
  values: FixedItemValues &
    FixedItemMatchValues & { startMonth: string; endMonth?: string | null },
): Promise<string> {
  const [row] = await db()`
    insert into fixed_items (user_id, name, category, amount_cents, due_day,
                             start_month, end_month, merchant, match_keywords,
                             is_estimate)
    values (${userId}, ${values.name}, ${values.category}, ${values.amountCents},
            ${values.dueDay}, ${values.startMonth}, ${values.endMonth ?? null},
            ${values.merchant ?? null}, ${values.matchKeywords ?? []}::text[],
            ${values.isEstimate ?? false})
    returning id
  `;
  return String(row?.id);
}

export async function updateFixedItemValues(
  userId: string,
  id: string,
  values: FixedItemValues & FixedItemMatchValues,
) {
  await db()`
    update fixed_items
    set name = ${values.name}, category = ${values.category},
        amount_cents = ${values.amountCents}, due_day = ${values.dueDay},
        merchant = case when ${values.merchant !== undefined}
                        then ${values.merchant ?? null} else merchant end,
        match_keywords = case when ${values.matchKeywords !== undefined}
                              then ${values.matchKeywords ?? []}::text[]
                              else match_keywords end,
        is_estimate = coalesce(${values.isEstimate ?? null}::boolean, is_estimate)
    where id = ${id} and user_id = ${userId}
  `;
}

/**
 * Ends an item at `endMonth` and inserts its replacement from `startMonth`,
 * atomically, so past months keep the old values. The replacement joins the
 * same series (the bill's amount history), keeps how its charges are matched
 * unless new values are given, and takes over the months already marked paid
 * and the expenses linked to it from `startMonth` on.
 */
export async function splitFixedItem(
  userId: string,
  id: string,
  endMonth: string,
  replacement: FixedItemValues &
    FixedItemMatchValues & {
      startMonth: string;
      endMonth: string | null;
    },
) {
  const merchantGiven = replacement.merchant !== undefined;
  const keywordsGiven = replacement.matchKeywords !== undefined;
  await db().transaction((sql) => [
    sql`update fixed_items set end_month = ${endMonth} where id = ${id} and user_id = ${userId}`,
    sql`
      with old as (
        select * from fixed_items where id = ${id} and user_id = ${userId}
      ),
      replacement as (
        insert into fixed_items (user_id, name, category, amount_cents, due_day,
                                 start_month, end_month, merchant,
                                 match_keywords, is_estimate, series_id)
        select ${userId}, ${replacement.name}, ${replacement.category},
               ${replacement.amountCents}, ${replacement.dueDay},
               ${replacement.startMonth}, ${replacement.endMonth},
               case when ${merchantGiven} then ${replacement.merchant ?? null}
                    else old.merchant end,
               case when ${keywordsGiven}
                    then ${replacement.matchKeywords ?? []}::text[]
                    else old.match_keywords end,
               coalesce(${replacement.isEstimate ?? null}::boolean, old.is_estimate),
               coalesce(old.series_id, old.id)
        from old
        returning id
      ),
      moved_expenses as (
        update expenses e set fixed_item_id = replacement.id
        from replacement
        where e.fixed_item_id = ${id} and e.user_id = ${userId}
          and e.month >= ${replacement.startMonth}
        returning e.id
      )
      update fixed_item_payments p set fixed_item_id = replacement.id
      from replacement
      where p.fixed_item_id = ${id} and p.user_id = ${userId}
        and p.month >= ${replacement.startMonth}
    `,
  ]);
}

export async function setFixedItemEndMonth(
  userId: string,
  id: string,
  endMonth: string,
) {
  await db()`
    update fixed_items set end_month = ${endMonth}
    where id = ${id} and user_id = ${userId}
  `;
}

export async function deleteFixedItemRow(userId: string, id: string) {
  await db()`delete from fixed_items where id = ${id} and user_id = ${userId}`;
}

/** One stretch of a bill's amount history. */
export type FixedItemAmountRow = {
  seriesId: string;
  startMonth: string;
  endMonth: string | null;
  amountCents: number;
  isEstimate: boolean;
};

/** Every row of the user's bills, grouped by series, oldest stretch first. */
export async function selectFixedItemHistory(
  userId: string,
): Promise<FixedItemAmountRow[]> {
  const rows = await db()`
    select coalesce(series_id, id) as series_id, start_month, end_month,
           amount_cents, is_estimate
    from fixed_items
    where user_id = ${userId}
    order by coalesce(series_id, id), start_month asc
  `;
  return rows.map((r) => ({
    seriesId: String(r.series_id),
    startMonth: String(r.start_month),
    endMonth: r.end_month == null ? null : String(r.end_month),
    amountCents: Number(r.amount_cents),
    isEstimate: Boolean(r.is_estimate),
  }));
}

/** The last real charge of each of the user's bills: when, and how much. */
export async function selectLastCharges(
  userId: string,
): Promise<Map<string, { paidOn: string; amountCents: number }>> {
  const rows = await db()`
    select distinct on (coalesce(f.series_id, f.id))
           coalesce(f.series_id, f.id) as series_id,
           coalesce(p.paid_on, e.spent_on) as paid_on,
           coalesce(e.amount_cents, p.amount_cents) as amount_cents
    from fixed_item_payments p
    join fixed_items f on f.id = p.fixed_item_id and f.user_id = p.user_id
    left join expenses e on e.id = p.expense_id and e.user_id = p.user_id
    where p.user_id = ${userId}
      and coalesce(p.paid_on, e.spent_on) is not null
      and coalesce(e.amount_cents, p.amount_cents) is not null
    order by coalesce(f.series_id, f.id), coalesce(p.paid_on, e.spent_on) desc
  `;
  const toDate = (v: unknown) =>
    v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  return new Map(
    rows.map((r) => [
      String(r.series_id),
      { paidOn: toDate(r.paid_on), amountCents: Number(r.amount_cents) },
    ]),
  );
}
