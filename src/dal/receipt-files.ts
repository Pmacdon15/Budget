import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import {
  type BillReceipt,
  type StoredReceiptFile,
  selectBillReceipts,
  selectPendingReceiptFile,
  selectReceiptFile,
} from "@/db/receipt-files";

export type { BillReceipt, StoredReceiptFile };

/*
 * Receipt copies (photo, PDF or email) for the signed-in user. Lookups go by
 * the receipt's (or pending item's) id, scoped to that user, so someone
 * else's receipt reads as missing. Pathnames never leave the server.
 */

/** For the receipt route: the saved copy, only when the receipt is this user's. */
export async function getReceiptFile(
  receiptId: string,
): Promise<StoredReceiptFile | null> {
  const userId = await currentUserIdOrThrow();
  return selectReceiptFile(userId, receiptId);
}

/** For the pending receipt route: the copy an AI attached to this user's item. */
export async function getPendingReceiptFile(
  pendingId: string,
): Promise<StoredReceiptFile | null> {
  const userId = await currentUserIdOrThrow();
  return selectPendingReceiptFile(userId, pendingId);
}

/** The receipts on the user's bill payments in `month`, by bill id. */
export const getBillReceipts = cache(
  async (month: string): Promise<ReadonlyMap<string, BillReceipt>> => {
    const userId = await requireUserId();
    return selectBillReceipts(userId, month);
  },
);
