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

export async function insertBillPayment(
  userId: string,
  fixedItemId: string,
  month: string,
) {
  await db()`
    insert into fixed_item_payments (user_id, fixed_item_id, month)
    values (${userId}, ${fixedItemId}, ${month})
    on conflict (fixed_item_id, month) do nothing
  `;
}

export async function deleteBillPayment(
  userId: string,
  fixedItemId: string,
  month: string,
) {
  await db()`
    delete from fixed_item_payments
    where fixed_item_id = ${fixedItemId} and month = ${month} and user_id = ${userId}
  `;
}
