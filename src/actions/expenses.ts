"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/expenses";
import {
  type ExpenseFormValues,
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

export async function deleteExpense(id: string) {
  return runAction(async () => {
    await dal.deleteExpense(idSchema.parse(id));
  });
}
