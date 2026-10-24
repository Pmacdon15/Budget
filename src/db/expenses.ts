import "server-only";
import { db, type Row } from "@/db/client";
import type { Expense } from "@/lib/types";

/** Raw SQL for the expenses table. Callers (the DAL) handle auth and rules. */

type ExpenseValues = {
  month: string;
  spentOn: string;
  description: string;
  category: string;
  amountCents: number;
};

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

const toExpense = (r: Row): Expense => ({
  id: r.id,
  month: String(r.month),
  spentOn: toDateString(r.spent_on),
  description: r.description,
  category: r.category,
  amountCents: Number(r.amount_cents),
});

export async function selectExpensesBetween(
  userId: string,
  from: string,
  to: string,
): Promise<Expense[]> {
  const rows = await db()`
    select id, month, spent_on, description, category, amount_cents
    from expenses
    where user_id = ${userId} and month between ${from} and ${to}
    order by spent_on desc, created_at desc
  `;
  return rows.map(toExpense);
}

export async function insertExpense(userId: string, values: ExpenseValues) {
  await db()`
    insert into expenses (user_id, month, spent_on, description, category, amount_cents)
    values (${userId}, ${values.month}, ${values.spentOn}, ${values.description},
            ${values.category}, ${values.amountCents})
  `;
}

/** Returns false when no row matched (missing, or not this user's). */
export async function updateExpenseRow(
  userId: string,
  id: string,
  values: ExpenseValues,
): Promise<boolean> {
  const rows = await db()`
    update expenses
    set month = ${values.month}, spent_on = ${values.spentOn},
        description = ${values.description}, category = ${values.category},
        amount_cents = ${values.amountCents}
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/** Returns false when no row matched (missing, or not this user's). */
export async function deleteExpenseRow(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    delete from expenses where id = ${id} and user_id = ${userId} returning id
  `;
  return rows.length > 0;
}
