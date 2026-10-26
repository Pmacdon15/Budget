import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import { updateFixedItemFor } from "@/dal/fixed-items";
import { selectFixedItemInMonth } from "@/db/fixed-items";
import {
  approvePendingExpense,
  countPendingExpenses,
  deletePendingExpense,
  selectPendingExpense,
  selectPendingExpenses,
  setPendingBill,
  updatePendingExpense,
} from "@/db/pending-expenses";
import { isCategory } from "@/lib/categories";
import { monthOfDate } from "@/lib/month";
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

/**
 * Approves an item. One that pays a fixed bill becomes that bill's payment for
 * its month. With `replace`, the bill's amount is first replaced by this real
 * charge from that month on (and it's no longer an estimate).
 */
export async function approvePending(
  id: string,
  options: { replace?: boolean } = {},
) {
  const userId = await currentUserIdOrThrow();
  if (options.replace) await replaceBillWith(userId, id);
  if (!(await approvePendingExpense(userId, id))) {
    throw new NotFoundError(GONE);
  }
}

/** Sets the linked bill's amount to the item's, from the item's month on. */
export async function replaceBillWith(userId: string, pendingId: string) {
  const item = await selectPendingExpense(userId, pendingId);
  if (!item) throw new NotFoundError(GONE);
  if (!item.fixedItemId) return;
  const month = monthOfDate(item.spentOn);
  const bill = await selectFixedItemInMonth(userId, item.fixedItemId, month);
  if (!bill) return;
  if (bill.amountCents === item.amountCents && !bill.isEstimate) return;
  await updateFixedItemFor(userId, bill.id, {
    name: bill.name,
    category: isCategory(bill.category) ? bill.category : "Other",
    amount: item.amountCents,
    dueDay: bill.dueDay,
    month,
    isEstimate: false,
    matchKeywords: undefined,
  });
}

/**
 * Flips an item between "pays a fixed bill / is a subscription" and "a
 * normal expense". `subscription: false` also unlinks any bill.
 */
export async function setPendingSubscription(
  id: string,
  subscription: boolean,
) {
  const userId = await currentUserIdOrThrow();
  const saved = await setPendingBill(
    userId,
    id,
    subscription
      ? { isSubscription: true }
      : { isSubscription: false, fixedItemId: null },
  );
  if (!saved) throw new NotFoundError(GONE);
}

export async function rejectPending(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await deletePendingExpense(userId, id))) {
    throw new NotFoundError(GONE);
  }
}
