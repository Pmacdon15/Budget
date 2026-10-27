import "server-only";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteExpenseRow,
  type ExpenseLine,
  insertExpenseLines,
  selectExpenseById,
  selectExpensesForExport,
  selectReceiptImage,
  updateExpenseRow,
} from "@/db/expenses";
import { monthOfDate } from "@/lib/month";
import { isOwnReceiptImagePathname } from "@/lib/receipt-image";
import { deleteReceiptImage } from "@/lib/receipt-store";
import type {
  ExpenseExportInput,
  ExpenseInput,
  ReceiptFieldsInput,
} from "@/lib/schemas";

/* ---------- Reads ---------- */

/** For the download route: the signed-in user's expenses matching the filters. */
export async function getExpensesForExport(filters: ExpenseExportInput) {
  const userId = await requireUserId();
  return selectExpensesForExport(
    userId,
    filters.from,
    filters.to,
    filters.categories,
  );
}

/** For the photo route: the pathname, only when the receipt is this user's. */
export async function getReceiptImagePathname(receiptId: string) {
  const userId = await currentUserIdOrThrow();
  return selectReceiptImage(userId, receiptId);
}

/* ---------- Writes ---------- */

const values = (input: ExpenseInput) => ({
  month: monthOfDate(input.spentOn),
  spentOn: input.spentOn,
  description: input.description,
  category: input.category,
  amountCents: input.amount,
});

/**
 * Saves a new expense. With `splits`, one expense is saved per category part
 * (same description and date); with a scanned photo, the receipt is saved once
 * and every part links to it.
 */
export async function createExpense(
  input: ExpenseInput &
    Partial<ReceiptFieldsInput> & {
      splits?: ExpenseLine[] | null;
    },
) {
  const userId = await currentUserIdOrThrow();
  const { category, amountCents, ...base } = values(input);
  const lines = input.splits?.length
    ? input.splits
    : [{ category, amountCents }];

  if (!input.receiptImage) {
    await insertExpenseLines(userId, base, lines, null);
    return;
  }

  // The pathname came back through the browser, so it is user input: only a
  // photo in the caller's own folder may be attached.
  if (!isOwnReceiptImagePathname(input.receiptImage, userId)) {
    throw new NotFoundError(
      "That receipt photo couldn't be attached. Scan it again.",
    );
  }
  await insertExpenseLines(userId, base, lines, {
    imagePathname: input.receiptImage,
    merchant: input.receiptMerchant ?? null,
    purchasedOn: input.receiptPurchasedOn ?? null,
    subtotalCents: input.receiptSubtotal ?? null,
    taxCents: input.receiptTax ?? null,
    totalCents: input.receiptTotal ?? null,
    rawText: input.receiptText ?? null,
  });
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const userId = await currentUserIdOrThrow();
  const updated = await updateExpenseRow(userId, id, values(input));
  if (!updated) throw new NotFoundError();
}

/**
 * Changes only an expense's amount, e.g. to the total read off the receipt
 * the user just uploaded, once they confirm it.
 */
export async function setExpenseAmount(id: string, amountCents: number) {
  const userId = await currentUserIdOrThrow();
  const expense = await selectExpenseById(userId, id);
  if (!expense) throw new NotFoundError();
  const updated = await updateExpenseRow(userId, id, {
    month: expense.month,
    spentOn: expense.spentOn,
    description: expense.description,
    category: expense.category,
    amountCents,
  });
  if (!updated) throw new NotFoundError();
}

export async function deleteExpense(id: string) {
  const userId = await currentUserIdOrThrow();
  const deleted = await deleteExpenseRow(userId, id);
  if (!deleted) throw new NotFoundError();
  if (deleted.imagePathname) await deleteReceiptImage(deleted.imagePathname);
  if (deleted.filePathname) await deleteReceiptImage(deleted.filePathname);
}
