import { z } from "zod";
import { idSchema, monthSchema } from "@/lib/schemas";
import type { FixedItem } from "@/lib/types";

/*
 * Marking a fixed bill paid for one month. It's optional bookkeeping: a bill
 * is still that month's cost (and still affects what's left over) whether or
 * not it's marked paid. Shared by the browser and the server.
 */

/** Marks (or unmarks) one fixed bill as paid in one month. */
export const billPaymentSchema = z.object({
  fixedItemId: idSchema,
  month: monthSchema,
});

export type BillPaymentInput = z.output<typeof billPaymentSchema>;

/** How much of a month's bills are paid and what's still due. */
export type BillsPaidSummary = {
  paidCount: number;
  totalCount: number;
  paidCents: number;
  dueCents: number;
};

export function summarizeBillsPaid(
  bills: Pick<FixedItem, "id" | "amountCents">[],
  paidIds: ReadonlySet<string>,
): BillsPaidSummary {
  let paidCount = 0;
  let paidCents = 0;
  let dueCents = 0;
  for (const bill of bills) {
    if (paidIds.has(bill.id)) {
      paidCount += 1;
      paidCents += bill.amountCents;
    } else {
      dueCents += bill.amountCents;
    }
  }
  return { paidCount, totalCount: bills.length, paidCents, dueCents };
}
