"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/savings-goals";
import {
  type ContributionFormValues,
  contributionSchema,
  type SavingsGoalFormValues,
  savingsGoalSchema,
} from "@/lib/savings-goals";
import { idSchema } from "@/lib/schemas";

export async function createSavingsGoal(values: SavingsGoalFormValues) {
  return runAction(async () => {
    await dal.createSavingsGoal(savingsGoalSchema.parse(values));
  });
}

export async function updateSavingsGoal(
  id: string,
  values: SavingsGoalFormValues,
) {
  return runAction(async () => {
    const input = savingsGoalSchema.parse(values);
    await dal.updateSavingsGoal(idSchema.parse(id), input);
  });
}

export async function deleteSavingsGoal(id: string) {
  return runAction(async () => {
    await dal.deleteSavingsGoal(idSchema.parse(id));
  });
}

export async function contributeToGoal(values: ContributionFormValues) {
  return runAction(async () => {
    await dal.contributeToGoal(contributionSchema.parse(values));
  });
}
