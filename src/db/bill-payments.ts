import "server-only";
import { db } from "@/db/client";

/** Raw SQL for bills marked paid. Callers (the DAL) handle auth and rules. */

/** Ids of the user's fixed bills marked paid in `month`. */
export async function selectPaidBillIds(
  userId: string,
  month: string,
): Promise<string[]> {
  const rows = await db()`
    select fixed_item_id from fixed_item_payments
    where user_id = ${userId} and month = ${month}
  `;
  return rows.map((r) => String(r.fixed_item_id));
}

/** How a payment left the bank, when known. */
export type BillPaymentDetails = {
  /** The day the money left. Without it the mark is bookkeeping only. */
  paidOn?: string | null;
  amountCents?: number | null;
  /** The expense that paid it: then that expense is what comes off the balance. */
  expenseId?: string | null;
};

/**
 * Marks a bill paid for `month`. Marking it again fills in details the first
 * mark didn't have (the day, the amount, the expense that paid it) and never
 * clears them.
 */
export async function insertBillPayment(
  userId: string,
  fixedItemId: string,
  month: string,
  details: BillPaymentDetails = {},
) {
  await db()`
    insert into fixed_item_payments (user_id, fixed_item_id, month, paid_on,
                                     amount_cents, expense_id)
    values (${userId}, ${fixedItemId}, ${month}, ${details.paidOn ?? null},
            ${details.amountCents ?? null}, ${details.expenseId ?? null})
    on conflict (fixed_item_id, month) do update
    set paid_on = coalesce(excluded.paid_on, fixed_item_payments.paid_on),
        amount_cents = coalesce(excluded.amount_cents, fixed_item_payments.amount_cents),
        expense_id = coalesce(excluded.expense_id, fixed_item_payments.expense_id)
  `;
}

export async function deleteBillPayment(
  userId: string,
  fixedItemId: string,
  month: string,
) {
  // A receipt kept on the payment itself goes with it (its file is removed by
  // the daily cleanup). One on the expense that paid it stays with the expense.
  await db()`
    with removed as (
      delete from fixed_item_payments
      where fixed_item_id = ${fixedItemId} and month = ${month} and user_id = ${userId}
      returning receipt_id
    )
    delete from receipts r using removed
    where r.id = removed.receipt_id and r.user_id = ${userId}
      and not exists (select 1 from expenses e where e.receipt_id = r.id)
  `;
}

/**
 * Links a saved expense to the fixed bill it paid and marks that month paid,
 * in one transaction. From then on the expense is that bill's payment: it
 * comes off the bank balance once, and isn't counted again as spending.
 * Returns false when the expense isn't the user's.
 */
export async function linkExpenseToBillRow(
  userId: string,
  expenseId: string,
  fixedItemId: string,
): Promise<boolean> {
  const [, rows] = await db().transaction((sql) => [
    sql`
      update expenses set fixed_item_id = ${fixedItemId}
      where id = ${expenseId} and user_id = ${userId}
        and exists (select 1 from fixed_items f
                    where f.id = ${fixedItemId} and f.user_id = ${userId})
    `,
    sql`
      insert into fixed_item_payments (user_id, fixed_item_id, month, paid_on,
                                       amount_cents, expense_id)
      select e.user_id, ${fixedItemId}, e.month, coalesce(e.paid_on, e.spent_on),
             e.amount_cents, e.id
      from expenses e
      join fixed_items f on f.id = ${fixedItemId} and f.user_id = e.user_id
      where e.id = ${expenseId} and e.user_id = ${userId}
      on conflict (fixed_item_id, month) do update
      set paid_on = excluded.paid_on, amount_cents = excluded.amount_cents,
          expense_id = excluded.expense_id
      returning fixed_item_id
    `,
  ]);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Undoes a link: the expense counts as normal spending again and the month it
 * paid is no longer marked paid by it. False when nothing was linked.
 */
export async function unlinkExpenseFromBillRow(
  userId: string,
  expenseId: string,
): Promise<boolean> {
  const [rows] = await db().transaction((sql) => [
    sql`
      update expenses set fixed_item_id = null
      where id = ${expenseId} and user_id = ${userId} and fixed_item_id is not null
      returning id
    `,
    sql`
      delete from fixed_item_payments
      where expense_id = ${expenseId} and user_id = ${userId}
    `,
  ]);
  return Array.isArray(rows) && rows.length > 0;
}
