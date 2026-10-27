"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/expenses";
import {
  type ExpenseFormValues,
  expenseAmountSchema,
  expenseSchema,
  expenseWithReceiptSchema,
  idSchema,
} from "@/lib/schemas";

export async function createExpense(values: ExpenseFormValues) {
  return runAction(async () => {
    const input = expenseWithReceiptSchema.parse(values);
    await dal.createExpense(input);
  });
}

export async function updateExpense(id: string, values: ExpenseFormValues) {
  return runAction(async () => {
    // A receipt is attached when the expense is created and never changed by an edit.
    const input = expenseSchema.parse(values);
    await dal.updateExpense(idSchema.parse(id), input);
  });
}

/** Sets an expense's amount (dollars, as typed, e.g. "212.40"). */
export async function setExpenseAmount(id: string, amount: string) {
  return runAction(async () => {
    const input = expenseAmountSchema.parse({ amount });
    await dal.setExpenseAmount(idSchema.parse(id), input.amount);
  });
}

/**
 * Nothing to change: the upload route already saved the receipt. Running an
 * action revalidates the page so the expense shows its new receipt link.
 */
export async function refreshAfterReceiptUpload() {
  return runAction(async () => {});
}

export async function deleteExpense(id: string) {
  return runAction(async () => {
    await dal.deleteExpense(idSchema.parse(id));
  });
}
