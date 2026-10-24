import "server-only";
import { db, type Row } from "@/db/client";
import type { Expense, ExpenseExportRow } from "@/lib/types";

/** Raw SQL for the expenses table. Callers (the DAL) handle auth and rules. */

type ExpenseValues = {
  month: string;
  spentOn: string;
  description: string;
  category: string;
  amountCents: number;
};

/** What was read off a scanned receipt, stored alongside the expense. */
export type ReceiptValues = {
  imagePathname: string;
  merchant: string | null;
  purchasedOn: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  rawText: string | null;
};

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

const nullableNumber = (value: unknown) =>
  value == null ? null : Number(value);

const toExpense = (r: Row): Expense => ({
  id: r.id,
  month: String(r.month),
  spentOn: toDateString(r.spent_on),
  description: r.description,
  category: r.category,
  amountCents: Number(r.amount_cents),
  receiptId: r.receipt_id ?? null,
});

export async function selectExpensesBetween(
  userId: string,
  from: string,
  to: string,
): Promise<Expense[]> {
  const rows = await db()`
    select id, month, spent_on, description, category, amount_cents, receipt_id
    from expenses
    where user_id = ${userId} and month between ${from} and ${to}
    order by spent_on desc, created_at desc
  `;
  return rows.map(toExpense);
}

/** Expenses in a month range and set of categories, oldest first, with receipt details. */
export async function selectExpensesForExport(
  userId: string,
  from: string,
  to: string,
  categories: string[],
): Promise<ExpenseExportRow[]> {
  const rows = await db()`
    select e.id, e.month, e.spent_on, e.description, e.category, e.amount_cents,
           e.receipt_id, r.merchant, r.subtotal_cents, r.tax_cents, r.image_pathname
    from expenses e
    left join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
    where e.user_id = ${userId}
      and e.month between ${from} and ${to}
      and e.category = any(${categories})
    order by e.spent_on asc, e.created_at asc
  `;
  return rows.map((r) => ({
    ...toExpense(r),
    merchant: r.merchant ?? null,
    subtotalCents: nullableNumber(r.subtotal_cents),
    taxCents: nullableNumber(r.tax_cents),
    imagePathname: r.image_pathname ?? null,
  }));
}

export async function insertExpense(userId: string, values: ExpenseValues) {
  await db()`
    insert into expenses (user_id, month, spent_on, description, category, amount_cents)
    values (${userId}, ${values.month}, ${values.spentOn}, ${values.description},
            ${values.category}, ${values.amountCents})
  `;
}

/** Saves the receipt and the expense in one statement, so neither exists without the other. */
export async function insertExpenseWithReceipt(
  userId: string,
  values: ExpenseValues,
  receipt: ReceiptValues,
) {
  await db()`
    with saved as (
      insert into receipts (user_id, merchant, purchased_on, subtotal_cents,
                            tax_cents, total_cents, raw_text, image_pathname)
      values (${userId}, ${receipt.merchant}, ${receipt.purchasedOn},
              ${receipt.subtotalCents}, ${receipt.taxCents}, ${receipt.totalCents},
              ${receipt.rawText}, ${receipt.imagePathname})
      returning id
    )
    insert into expenses (user_id, month, spent_on, description, category,
                          amount_cents, receipt_id)
    select ${userId}, ${values.month}, ${values.spentOn}, ${values.description},
           ${values.category}, ${values.amountCents}, saved.id
    from saved
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

/**
 * Deletes the expense and its receipt row. Returns null when no row matched
 * (missing, or not this user's); otherwise the receipt photo's pathname, if
 * there was one, so the caller can remove the photo too.
 */
export async function deleteExpenseRow(
  userId: string,
  id: string,
): Promise<{ imagePathname: string | null } | null> {
  const rows = await db()`
    with removed as (
      delete from expenses where id = ${id} and user_id = ${userId}
      returning id, receipt_id
    ),
    gone as (
      delete from receipts r using removed
      where r.id = removed.receipt_id and r.user_id = ${userId}
      returning r.image_pathname
    )
    select removed.id, (select image_pathname from gone limit 1) as image_pathname
    from removed
  `;
  const [row] = rows;
  return row ? { imagePathname: row.image_pathname ?? null } : null;
}

/** The photo pathname of one of this user's receipts, or null. */
export async function selectReceiptImage(
  userId: string,
  receiptId: string,
): Promise<string | null> {
  const rows = await db()`
    select image_pathname from receipts
    where id = ${receiptId} and user_id = ${userId}
  `;
  return rows[0]?.image_pathname ?? null;
}
