"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/pending-income";
import { idSchema } from "@/lib/schemas";

/** Saves the income as take-home for its month, with its receipt. */
export async function approvePendingIncome(id: string) {
  return runAction(async () => {
    await dal.approveIncome(idSchema.parse(id));
  });
}

/** Throws the income away without saving it. */
export async function rejectPendingIncome(id: string) {
  return runAction(async () => {
    await dal.rejectIncome(idSchema.parse(id));
  });
}
