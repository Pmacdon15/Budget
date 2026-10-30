import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  approvePendingAccountRow,
  deleteAccountRow,
  deletePendingAccountRow,
  deleteTransferRow,
  insertAccount,
  insertTransfer,
  selectAccount,
  selectAccounts,
  selectPendingAccounts,
  selectStatementPdf,
  selectStatements,
  selectTransfers,
  updateAccountRow,
} from "@/db/accounts";
import {
  type AccountInput,
  isDebtType,
  type TransferInput,
} from "@/lib/accounts";
import {
  type ExpenseAccountOption,
  toExpenseAccountOption,
} from "@/lib/expense-accounts";
import { deleteStatementPdf } from "@/lib/statement-store";

/*
 * Accounts for the signed-in user: the Accounts page, the Overview and the
 * Review page's proposed accounts. The MCP server works on the same rows
 * through src/mcp/tools.ts.
 */

/* ---------- Reads ---------- */

/** The user's accounts with their balances now. Shared per request. */
export const getAccounts = cache(async () => {
  const userId = await requireUserId();
  return selectAccounts(userId);
});

/**
 * The accounts an expense can come out of, for the expense form's "Paid from"
 * picker. Throws `UnauthorizedError` when signed out.
 */
export async function getExpenseAccountOptions(): Promise<
  ExpenseAccountOption[]
> {
  const userId = await currentUserIdOrThrow();
  return (await selectAccounts(userId)).map(toExpenseAccountOption);
}

export const getStatements = cache(async () => {
  const userId = await requireUserId();
  return selectStatements(userId);
});

export const getTransfers = cache(async () => {
  const userId = await requireUserId();
  return selectTransfers(userId);
});

/** Accounts an AI proposed, waiting on the Review page. */
export const getPendingAccounts = cache(async () => {
  const userId = await requireUserId();
  return selectPendingAccounts(userId);
});

/** A statement's PDF pathname, only when the statement is the signed-in user's. */
export async function getStatementPdfPathname(statementId: string) {
  const userId = await currentUserIdOrThrow();
  return selectStatementPdf(userId, statementId);
}

/* ---------- Writes ---------- */

/** Credit details only mean something on a credit card or line of credit. */
const values = (input: AccountInput) => {
  const debt = isDebtType(input.type);
  return {
    type: input.type,
    name: input.name,
    institution: input.institution,
    lastFour: input.lastFour,
    creditLimitCents: debt ? input.creditLimit : null,
    availableCreditCents: debt ? input.availableCredit : null,
    statementBalanceCents: debt ? input.statementBalance : null,
    paymentDueDate: debt ? input.paymentDueDate : null,
    minimumPaymentCents: debt ? input.minimumPayment : null,
  };
};

export async function createAccount(input: AccountInput) {
  const userId = await currentUserIdOrThrow();
  await insertAccount(userId, {
    ...values(input),
    balanceCents: input.balance,
    balanceSource: "manual",
    isPrimary: input.isPrimary,
  });
}

/**
 * Saves an account's details. The balance is only re-entered (as of now)
 * when it changed from what the account shows, so renaming an account keeps
 * its balance and the expenses counted against it.
 */
export async function updateAccount(id: string, input: AccountInput) {
  const userId = await currentUserIdOrThrow();
  const existing = await selectAccount(userId, id);
  if (!existing) throw new NotFoundError();
  const changed = input.balance !== existing.balanceCents;
  const updated = await updateAccountRow(userId, id, {
    ...values(input),
    balanceCents: changed ? input.balance : undefined,
    isPrimary: input.isPrimary,
  });
  if (!updated) throw new NotFoundError();
}

export async function deleteAccount(id: string) {
  const userId = await currentUserIdOrThrow();
  const deleted = await deleteAccountRow(userId, id);
  if (!deleted) throw new NotFoundError();
  await Promise.all(
    deleted.pdfPathnames.map((pathname) => deleteStatementPdf(pathname)),
  );
}

export async function createTransfer(input: TransferInput) {
  const userId = await currentUserIdOrThrow();
  const id = await insertTransfer(userId, {
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountCents: input.amount,
    transferredOn: input.transferredOn,
    description: input.description,
    source: null,
    client: null,
  });
  if (!id) throw new NotFoundError("Pick two of your accounts.");
}

export async function deleteTransfer(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await deleteTransferRow(userId, id))) throw new NotFoundError();
}

const GONE = "That item was already handled. Refresh to see what's left.";

/** Creates the proposed account (and records the statement that came with it). */
export async function approvePendingAccount(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await approvePendingAccountRow(userId, id))) {
    throw new NotFoundError(GONE);
  }
}

/** Throws the proposal away, with its statement PDF. */
export async function rejectPendingAccount(id: string) {
  const userId = await currentUserIdOrThrow();
  const removed = await deletePendingAccountRow(userId, id);
  if (!removed) throw new NotFoundError(GONE);
  if (removed.pdfPathname) await deleteStatementPdf(removed.pdfPathname);
}
