import "server-only";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteGoalRow,
  insertContribution,
  insertGoal,
  selectGoal,
  selectGoals,
  updateGoalRow,
} from "@/db/savings-goals";
import type {
  ContributionInput,
  SavingsGoal,
  SavingsGoalInput,
} from "@/lib/savings-goals";

/* ---------- Reads ---------- */

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  const userId = await requireUserId();
  return selectGoals(userId);
}

/* ---------- Writes ---------- */

const values = (input: SavingsGoalInput) => ({
  name: input.name,
  targetCents: input.target,
  targetDate: input.targetDate,
});

export async function createSavingsGoal(input: SavingsGoalInput) {
  const userId = await currentUserIdOrThrow();
  await insertGoal(userId, { ...values(input), startMonth: input.month });
}

export async function updateSavingsGoal(id: string, input: SavingsGoalInput) {
  const userId = await currentUserIdOrThrow();
  const updated = await updateGoalRow(userId, id, values(input));
  if (!updated) throw new NotFoundError();
}

export async function deleteSavingsGoal(id: string) {
  const userId = await currentUserIdOrThrow();
  const deleted = await deleteGoalRow(userId, id);
  if (!deleted) throw new NotFoundError();
}

/** Puts money toward one of the user's goals, as a Savings expense. */
export async function contributeToGoal(input: ContributionInput) {
  const userId = await currentUserIdOrThrow();
  const goal = await selectGoal(userId, input.goalId);
  if (!goal) throw new NotFoundError();
  await insertContribution(userId, goal, {
    spentOn: input.spentOn,
    amountCents: input.amount,
  });
}
