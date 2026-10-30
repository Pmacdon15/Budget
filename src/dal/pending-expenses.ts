import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { ConflictError, NotFoundError } from "@/dal/errors";
import { chooseExpenseAccount } from "@/dal/expenses";
import { updateFixedItemFor } from "@/dal/fixed-items";
import { selectAccounts } from "@/db/accounts";
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
import { resolveExpenseAccount } from "@/lib/expense-accounts";
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

/** The message when an item can't be approved until the user picks its account. */
export const CHOOSE_ACCOUNT_FIRST =
  "You have more than one account. Edit this item and choose the account it was paid from, then approve it.";

export async function editPendingExpense(id: string, input: ExpenseInput) {
  const userId = await currentUserIdOrThrow();
  // A picked account must be the user's; none picked keeps the item's.
  const accountId = input.accountId
    ? await chooseExpenseAccount(userId, input.accountId)
    : undefined;
  const updated = await updatePendingExpense(userId, id, {
    spentOn: input.spentOn,
    description: input.description,
    category: input.category,
    amountCents: input.amount,
    accountId,
  });
  if (!updated) throw new NotFoundError(GONE);
}

/**
 * The account an item comes out of once approved. The one the user confirmed
 * (to the AI, or by editing); with no such account, the only one they have.
 * With several and none confirmed, it's never guessed.
 */
async function approvedAccount(userId: string, id: string) {
  const item = await selectPendingExpense(userId, id);
  if (!item) throw new NotFoundError(GONE);
  const choice = resolveExpenseAccount(
    await selectAccounts(userId),
    item.accountId,
  );
  if (choice.kind !== "ok") throw new ConflictError(CHOOSE_ACCOUNT_FIRST);
  return choice.accountId;
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
  // Checked first, so a refusal never leaves a bill half-replaced.
  const accountId = await approvedAccount(userId, id);
  if (options.replace) await replaceBillWith(userId, id);
  if (!(await approvePendingExpense(userId, id, accountId))) {
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
