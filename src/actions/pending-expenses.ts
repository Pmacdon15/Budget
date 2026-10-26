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

/**
 * Saves the item as an expense. With `replace`, the fixed bill it pays takes
 * this charge's amount from its month on.
 */
export async function approvePendingExpense(
  id: string,
  options: { replace?: boolean } = {},
) {
  return runAction(async () => {
    await dal.approvePending(idSchema.parse(id), {
      replace: options?.replace === true,
    });
  });
}

/** Marks the item a subscription (fixed bill) or a normal expense. */
export async function setPendingSubscription(
  id: string,
  subscription: boolean,
) {
  return runAction(async () => {
    await dal.setPendingSubscription(idSchema.parse(id), subscription === true);
  });
}

/** Throws the item away without saving it. */
export async function rejectPendingExpense(id: string) {
  return runAction(async () => {
    await dal.rejectPending(idSchema.parse(id));
  });
}
