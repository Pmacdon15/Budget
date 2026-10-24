"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/expenses";
import { type ExpenseFormValues, expenseSchema, idSchema } from "@/lib/schemas";

export async function createExpense(values: ExpenseFormValues) {
  return runAction(async () => {
    const input = expenseSchema.parse(values);
    await dal.createExpense(input);
  });
}

export async function updateExpense(id: string, values: ExpenseFormValues) {
  return runAction(async () => {
    const input = expenseSchema.parse(values);
    await dal.updateExpense(idSchema.parse(id), input);
  });
}

export async function deleteExpense(id: string) {
  return runAction(async () => {
    await dal.deleteExpense(idSchema.parse(id));
  });
}
