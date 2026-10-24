import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteExpenseRow,
  insertExpense,
  updateExpenseRow,
} from "@/db/expenses";
import { monthOfDate } from "@/lib/month";
import type { ExpenseInput } from "@/lib/schemas";

/* ---------- Writes ---------- */

const values = (input: ExpenseInput) => ({
  month: monthOfDate(input.spentOn),
  spentOn: input.spentOn,
  description: input.description,
  category: input.category,
  amountCents: input.amount,
});

export async function createExpense(input: ExpenseInput) {
  const userId = await currentUserIdOrThrow();
  await insertExpense(userId, values(input));
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const userId = await currentUserIdOrThrow();
  const updated = await updateExpenseRow(userId, id, values(input));
  if (!updated) throw new NotFoundError();
}

export async function deleteExpense(id: string) {
  const userId = await currentUserIdOrThrow();
  const deleted = await deleteExpenseRow(userId, id);
  if (!deleted) throw new NotFoundError();
}
