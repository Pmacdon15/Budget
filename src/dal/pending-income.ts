import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  approvePendingIncome,
  deletePendingIncome,
  selectPendingIncomeList,
} from "@/db/pending-income";

/*
 * The Review page's side of income an AI submitted (an e-Transfer someone
 * sent the user, a deposit), for the signed-in user. The MCP server adds it
 * (src/mcp/income-tools.ts). Approving makes it a take-home entry for its
 * month, with its receipt, deposited into its account.
 */

export const getPendingIncome = cache(async () => {
  const userId = await requireUserId();
  return selectPendingIncomeList(userId);
});

const GONE = "That item was already handled. Refresh to see what's left.";

export async function approveIncome(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await approvePendingIncome(userId, id))) {
    throw new NotFoundError(GONE);
  }
}

export async function rejectIncome(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await deletePendingIncome(userId, id))) {
    throw new NotFoundError(GONE);
  }
}
