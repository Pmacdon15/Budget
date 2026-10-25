import "server-only";
import { cache } from "react";
import { requireUserId } from "@/dal/auth";
import { selectReceiptLibrary } from "@/db/receipt-library";
import { RECEIPT_LIBRARY_LIMIT } from "@/lib/schemas/receipt-library";

/**
 * The signed-in user's scanned receipts, newest first, for the receipt
 * library. Deduplicated per request so the count and the list share one read.
 */
export const getReceiptLibrary = cache(async (search: string) => {
  const userId = await requireUserId();
  // One extra row tells the page whether the list was cut off.
  const rows = await selectReceiptLibrary(
    userId,
    search,
    RECEIPT_LIBRARY_LIMIT + 1,
  );
  return {
    receipts: rows.slice(0, RECEIPT_LIBRARY_LIMIT),
    truncated: rows.length > RECEIPT_LIBRARY_LIMIT,
  };
});
