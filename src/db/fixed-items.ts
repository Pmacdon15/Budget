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

const toFixedItem = (r: Row): FixedItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  amountCents: Number(r.amount_cents),
  dueDay: r.due_day == null ? null : Number(r.due_day),
  startMonth: String(r.start_month),
  endMonth: r.end_month == null ? null : String(r.end_month),
});

export async function selectFixedItems(userId: string): Promise<FixedItem[]> {
  const rows = await db()`
    select id, name, category, amount_cents, due_day, start_month, end_month
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
    select id, name, category, amount_cents, due_day, start_month, end_month
    from fixed_items
    where id = ${id} and user_id = ${userId}
  `;
  return row ? toFixedItem(row) : null;
}

export async function insertFixedItem(
  userId: string,
  values: FixedItemValues & { startMonth: string; endMonth?: string | null },
) {
  await db()`
    insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month, end_month)
    values (${userId}, ${values.name}, ${values.category}, ${values.amountCents},
            ${values.dueDay}, ${values.startMonth}, ${values.endMonth ?? null})
  `;
}

export async function updateFixedItemValues(
  userId: string,
  id: string,
  values: FixedItemValues,
) {
  await db()`
    update fixed_items
    set name = ${values.name}, category = ${values.category},
        amount_cents = ${values.amountCents}, due_day = ${values.dueDay}
    where id = ${id} and user_id = ${userId}
  `;
}

/**
 * Ends an item at `endMonth` and inserts its replacement from `startMonth`,
 * atomically, so past months keep the old values.
 */
export async function splitFixedItem(
  userId: string,
  id: string,
  endMonth: string,
  replacement: FixedItemValues & {
    startMonth: string;
    endMonth: string | null;
  },
) {
  await db().transaction((sql) => [
    sql`update fixed_items set end_month = ${endMonth} where id = ${id} and user_id = ${userId}`,
    sql`
      insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month, end_month)
      values (${userId}, ${replacement.name}, ${replacement.category}, ${replacement.amountCents},
              ${replacement.dueDay}, ${replacement.startMonth}, ${replacement.endMonth})
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
