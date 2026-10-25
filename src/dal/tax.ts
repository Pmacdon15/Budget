import "server-only";
import { cache } from "react";
import { requireUserId } from "@/dal/auth";
import { selectReceiptTaxByMonth } from "@/db/tax";
import { type TaxSummary, taxSummary, yearOf } from "@/lib/tax";

/** GST paid in `month` and across its calendar year, for the signed-in user. */
export const getTaxSummary = cache(
  async (month: string): Promise<TaxSummary> => {
    const userId = await requireUserId();
    const { from, to } = yearOf(month);
    const rows = await selectReceiptTaxByMonth(userId, from, to);
    return taxSummary(month, rows);
  },
);
