import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteBillPayment,
  insertBillPayment,
  selectPaidBillIds,
} from "@/db/bill-payments";
import { selectFixedItem } from "@/db/fixed-items";
import type { BillPaymentInput } from "@/lib/bill-payments";
import { isActive } from "@/lib/budget";

/* ---------- Reads ---------- */

/** Ids of the signed-in user's bills marked paid in `month`. */
export const getPaidBillIds = cache(
  async (month: string): Promise<ReadonlySet<string>> => {
    const userId = await requireUserId();
    return new Set(await selectPaidBillIds(userId, month));
  },
);

/* ---------- Writes ---------- */

/** Marks one of the user's bills paid for a month it's active in. */
export async function markBillPaid(input: BillPaymentInput) {
  const userId = await currentUserIdOrThrow();
  const item = await selectFixedItem(userId, input.fixedItemId);
  if (!item || !isActive(item, input.month)) throw new NotFoundError();
  await insertBillPayment(userId, item.id, input.month);
}

/** Takes the paid mark off again. The bill still counts toward the month either way. */
export async function unmarkBillPaid(input: BillPaymentInput) {
  const userId = await currentUserIdOrThrow();
  const item = await selectFixedItem(userId, input.fixedItemId);
  if (!item) throw new NotFoundError();
  await deleteBillPayment(userId, item.id, input.month);
}
