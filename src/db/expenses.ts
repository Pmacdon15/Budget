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

/** The same, for a receipt that may have no photo (one read off an email). */
export type ReceiptValuesNullableImage = Omit<
  ReceiptValues,
  "imagePathname"
> & {
  imagePathname: string | null;
};

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

const nullableNumber = (value: unknown) =>
  value == null ? null : Number(value);

export const toExpense = (r: Row): Expense => ({
  id: r.id,
  month: String(r.month),
  spentOn: toDateString(r.spent_on),
  description: r.description,
  category: r.category,
  amountCents: Number(r.amount_cents),
  receiptId: r.receipt_id ?? null,
  ...(r.receipt_has_photo === undefined
    ? {}
    : { receiptHasPhoto: Boolean(r.receipt_has_photo) }),
  ...(r.unpaid === undefined ? {} : { unpaid: Boolean(r.unpaid) }),
});

export async function selectExpensesBetween(
  userId: string,
  from: string,
  to: string,
): Promise<Expense[]> {
  const rows = await db()`
    select id, month, spent_on, description, category, amount_cents, receipt_id,
           unpaid,
           (select r.image_pathname is not null from receipts r
            where r.id = expenses.receipt_id) as receipt_has_photo
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
           e.receipt_id, r.merchant, r.image_pathname,
           -- A split receipt's subtotal and tax are shared by its parts in
           -- proportion to their amounts, so the column still adds up.
           round(r.subtotal_cents::numeric * e.amount_cents / nullif(parts.spend, 0))::int as subtotal_cents,
           round(r.tax_cents::numeric * e.amount_cents / nullif(parts.spend, 0))::int as tax_cents
    from expenses e
    left join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
    left join lateral (
      select sum(x.amount_cents) as spend
      from expenses x
      where x.receipt_id = e.receipt_id and x.user_id = e.user_id
    ) parts on e.receipt_id is not null
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

/** One of this user's expenses, or null when it's missing or someone else's. */
export async function selectExpenseById(
  userId: string,
  id: string,
): Promise<Expense | null> {
  const rows = await db()`
    select id, month, spent_on, description, category, amount_cents, receipt_id
    from expenses
    where id = ${id} and user_id = ${userId}
  `;
  return rows[0] ? toExpense(rows[0]) : null;
}

export async function insertExpense(userId: string, values: ExpenseValues) {
  await db()`
    insert into expenses (user_id, month, spent_on, description, category, amount_cents)
    values (${userId}, ${values.month}, ${values.spentOn}, ${values.description},
            ${values.category}, ${values.amountCents})
  `;
}

/** One category's part of an expense (a whole expense is a single line). */
export type ExpenseLine = { category: string; amountCents: number };

type ExpenseBase = Omit<ExpenseValues, "category" | "amountCents">;

/**
 * Saves one expense per line, plus the receipt they came from when there is
 * one, in a single statement: the parts and their receipt exist together or
 * not at all.
 */
export async function insertExpenseLines(
  userId: string,
  base: ExpenseBase,
  lines: ExpenseLine[],
  receipt: ReceiptValues | null,
) {
  const categories = lines.map((l) => l.category);
  const amounts = lines.map((l) => l.amountCents);

  if (!receipt) {
    await db()`
      insert into expenses (user_id, month, spent_on, description, category, amount_cents)
      select ${userId}, ${base.month}, ${base.spentOn}, ${base.description},
             line.category, line.amount_cents
      from unnest(${categories}::text[], ${amounts}::int[]) as line(category, amount_cents)
    `;
    return;
  }

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
    select ${userId}, ${base.month}, ${base.spentOn}, ${base.description},
           line.category, line.amount_cents, saved.id
    from saved,
         unnest(${categories}::text[], ${amounts}::int[]) as line(category, amount_cents)
  `;
}

/** Saves the receipt and a single expense for it. */
export async function insertExpenseWithReceipt(
  userId: string,
  values: ExpenseValues,
  receipt: ReceiptValues,
) {
  const { category, amountCents, ...base } = values;
  await insertExpenseLines(userId, base, [{ category, amountCents }], receipt);
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
 * Deletes the expense, and its receipt once no other part of a split still
 * uses it. Returns null when no row matched (missing, or not this user's);
 * otherwise the pathname of a photo that is no longer referenced, so the
 * caller can remove it too.
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
        -- The statement sees the table as it was, so skip the row being removed.
        and not exists (
          select 1 from expenses other
          where other.receipt_id = r.id and other.id <> removed.id
        )
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

/** An expense as the AI tools list it: its status included. */
export type ExpenseWithStatus = Expense & {
  unpaid: boolean;
  hasReceipt: boolean;
};

/** This user's expenses dated `from`..`to` (YYYY-MM-DD), newest first. */
export async function selectExpensesWithStatus(
  userId: string,
  from: string,
  to: string,
): Promise<ExpenseWithStatus[]> {
  const rows = await db()`
    select id, month, spent_on, description, category, amount_cents, receipt_id,
           unpaid
    from expenses
    where user_id = ${userId} and spent_on between ${from} and ${to}
    order by spent_on desc, created_at desc
  `;
  return rows.map((r) => ({
    ...toExpense(r),
    unpaid: Boolean(r.unpaid),
    hasReceipt: r.receipt_id != null,
  }));
}

/**
 * Marks one of this user's unpaid expenses paid on `paidOn`. From then on it
 * comes off the bank balance, if it was paid after the balance was set.
 * Returns "paid", "already" (it wasn't unpaid) or "missing".
 */
export async function markExpensePaidRow(
  userId: string,
  id: string,
  paidOn: string,
): Promise<"paid" | "already" | "missing"> {
  const rows = await db()`
    with target as (
      select id, unpaid from expenses where id = ${id} and user_id = ${userId}
    ),
    paid as (
      update expenses e set unpaid = false, paid_at = now(), paid_on = ${paidOn}
      from target
      where e.id = target.id and target.unpaid
      returning e.id
    )
    select (select unpaid from target) as was_unpaid,
           (select count(*) from paid)::int as paid
  `;
  const [row] = rows;
  if (row?.was_unpaid == null) return "missing";
  return Number(row.paid) > 0 ? "paid" : "already";
}

/**
 * Attaches a receipt to one of this user's expenses, or replaces the details
 * (and photo) of the one it has. A receipt split across several expenses is
 * shared, so replacing it changes it for every part. Returns the old photo when
 * a different one replaced it, so the caller can remove it; or false when the
 * expense is missing or someone else's.
 */
export async function setExpenseReceipt(
  userId: string,
  expenseId: string,
  receipt: ReceiptValuesNullableImage,
): Promise<{ replacedImage: string | null } | false> {
  const rows = await db()`
    with target as (
      select id, receipt_id from expenses
      where id = ${expenseId} and user_id = ${userId}
    ),
    old as (
      select r.image_pathname from receipts r, target
      where r.id = target.receipt_id and r.user_id = ${userId}
    ),
    updated as (
      update receipts r
      set merchant = ${receipt.merchant}, purchased_on = ${receipt.purchasedOn},
          subtotal_cents = ${receipt.subtotalCents}, tax_cents = ${receipt.taxCents},
          total_cents = ${receipt.totalCents}, raw_text = ${receipt.rawText},
          image_pathname = ${receipt.imagePathname}
      from target
      where r.id = target.receipt_id and r.user_id = ${userId}
      returning r.id
    ),
    inserted as (
      insert into receipts (user_id, merchant, purchased_on, subtotal_cents,
                            tax_cents, total_cents, raw_text, image_pathname)
      select ${userId}, ${receipt.merchant}, ${receipt.purchasedOn},
             ${receipt.subtotalCents}, ${receipt.taxCents}, ${receipt.totalCents},
             ${receipt.rawText}, ${receipt.imagePathname}
      from target
      where target.receipt_id is null
      returning id
    ),
    linked as (
      update expenses e set receipt_id = inserted.id
      from inserted
      where e.id = ${expenseId} and e.user_id = ${userId}
      returning e.id
    )
    select (select count(*) from target)::int as found,
           (select image_pathname from old limit 1) as old_image,
           (select count(*) from updated)::int + (select count(*) from linked)::int as changed
  `;
  const [row] = rows;
  if (!row || Number(row.found) === 0) return false;
  const oldImage = row.old_image ?? null;
  return {
    replacedImage:
      oldImage && oldImage !== receipt.imagePathname ? String(oldImage) : null,
  };
}
