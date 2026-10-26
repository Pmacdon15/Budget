"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/pending-expenses";
import { type ExpenseFormValues, expenseSchema, idSchema } from "@/lib/schemas";

/** Fixes what the AI read (amount, date, description, category) before approving. */
export async function editPendingExpense(
  id: string,
  values: ExpenseFormValues,
) {
  return runAction(async () => {
    await dal.editPendingExpense(
      idSchema.parse(id),
      expenseSchema.parse(values),
    );
  });
}

/** Saves the item as a normal expense. */
export async function approvePendingExpense(id: string) {
  return runAction(async () => {
    await dal.approvePending(idSchema.parse(id));
  });
}

/** Throws the item away without saving it. */
export async function rejectPendingExpense(id: string) {
  return runAction(async () => {
    await dal.rejectPending(idSchema.parse(id));
  });
}
