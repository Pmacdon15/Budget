import "server-only";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteIncomeRow,
  insertIncome,
  selectLatestIncome,
  updateIncomeRow,
} from "@/db/income";
import type { IncomeInput } from "@/lib/schemas";
import type { IncomeEntry } from "@/lib/types";

/* ---------- Reads ---------- */

/** The most recent take-home entry, used to prefill the next one. */
export async function getLatestIncome(): Promise<IncomeEntry | null> {
  const userId = await requireUserId();
  return selectLatestIncome(userId);
}

/* ---------- Writes ---------- */

const values = (input: IncomeInput) => ({
  month: input.month,
  label: input.label,
  amountCents: input.amount,
  receivedOn: input.receivedOn,
});

export async function createIncome(input: IncomeInput) {
  const userId = await currentUserIdOrThrow();
  await insertIncome(userId, values(input));
}

export async function updateIncome(id: string, input: IncomeInput) {
  const userId = await currentUserIdOrThrow();
  const updated = await updateIncomeRow(userId, id, values(input));
  if (!updated) throw new NotFoundError();
}

export async function deleteIncome(id: string) {
  const userId = await currentUserIdOrThrow();
  const deleted = await deleteIncomeRow(userId, id);
  if (!deleted) throw new NotFoundError();
}
