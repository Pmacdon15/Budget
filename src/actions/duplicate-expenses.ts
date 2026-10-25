"use server";

import * as dal from "@/dal/duplicate-expenses";
import { UnauthorizedError } from "@/dal/errors";
import type { DuplicateExpense } from "@/lib/duplicate-expenses";
import {
  type ExpenseFormValues,
  expenseWithReceiptSchema,
} from "@/lib/schemas";

/**
 * Before a new expense is saved: returns a saved expense it looks like, or
 * null. Only a warning, so it never blocks the save: invalid values, a
 * signed-out caller or a failed query all answer null, and `createExpense`
 * reports any real problem itself.
 */
export async function checkDuplicateExpense(
  values: ExpenseFormValues,
): Promise<DuplicateExpense | null> {
  const parsed = expenseWithReceiptSchema.safeParse(values);
  if (!parsed.success) return null;
  try {
    return await dal.findDuplicateExpense({
      spentOn: parsed.data.spentOn,
      amountCents: parsed.data.amount,
      description: parsed.data.description,
      merchant: parsed.data.receiptMerchant,
    });
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) console.error(error);
    return null;
  }
}
