import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  approvePendingExpense,
  countPendingExpenses,
  deletePendingExpense,
  selectPendingExpenses,
  updatePendingExpense,
} from "@/db/pending-expenses";
import type { ExpenseInput } from "@/lib/schemas";

/*
 * The Review page's side of AI-submitted expenses, for the signed-in user.
 * The MCP server adds them (src/mcp/tools.ts); approving turns one into a
 * normal expense, which then comes off the bank balance like any other.
 */

/* ---------- Reads ---------- */

export const getPendingExpenses = cache(async () => {
  const userId = await requireUserId();
  return selectPendingExpenses(userId);
});

export const getPendingExpenseCount = cache(async () => {
  const userId = await requireUserId();
  return countPendingExpenses(userId);
});

/* ---------- Writes ---------- */

const GONE = "That item was already handled. Refresh to see what's left.";

export async function editPendingExpense(id: string, input: ExpenseInput) {
  const userId = await currentUserIdOrThrow();
  const updated = await updatePendingExpense(userId, id, {
    spentOn: input.spentOn,
    description: input.description,
    category: input.category,
    amountCents: input.amount,
  });
  if (!updated) throw new NotFoundError(GONE);
}

export async function approvePending(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await approvePendingExpense(userId, id))) {
    throw new NotFoundError(GONE);
  }
}

export async function rejectPending(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await deletePendingExpense(userId, id))) {
    throw new NotFoundError(GONE);
  }
}
