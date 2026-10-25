import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteExpenseKeepingUndo,
  deleteIncomeKeepingUndo,
  purgeExpiredUndo,
  restoreExpense,
  restoreFixedItem,
  restoreIncome,
  selectUndoKind,
  stopFixedItemKeepingUndo,
} from "@/db/undo";
import { addMonths } from "@/lib/month";
import { deleteReceiptImage } from "@/lib/receipt-store";
import { UNDO_WINDOW_MINUTES } from "@/lib/undo";

/*
 * Deletes that can be undone. Each returns an undo id for the toast's Undo
 * button. Ownership is checked on the delete and again on the restore: an undo
 * id only works for the user who made it, and only for UNDO_WINDOW_MINUTES.
 */

/** Removes photos from deletes whose undo window has passed. Best effort. */
async function purgeExpired(userId: string) {
  try {
    const photos = await purgeExpiredUndo(userId, UNDO_WINDOW_MINUTES);
    await Promise.all(photos.map((photo) => deleteReceiptImage(photo)));
  } catch (error) {
    console.error("clearing expired undo entries failed", error);
  }
}

export async function deleteExpenseWithUndo(id: string): Promise<string> {
  const userId = await currentUserIdOrThrow();
  const undoId = await deleteExpenseKeepingUndo(userId, id);
  if (!undoId) throw new NotFoundError();
  await purgeExpired(userId);
  return undoId;
}

/** Same rule as `stopFixedItem`: stopped from `fromMonth`, or deleted if it started then. */
export async function stopFixedItemWithUndo(
  id: string,
  fromMonth: string,
): Promise<string> {
  const userId = await currentUserIdOrThrow();
  const undoId = await stopFixedItemKeepingUndo(
    userId,
    id,
    fromMonth,
    addMonths(fromMonth, -1),
  );
  if (!undoId) throw new NotFoundError();
  await purgeExpired(userId);
  return undoId;
}

export async function deleteIncomeWithUndo(id: string): Promise<string> {
  const userId = await currentUserIdOrThrow();
  const undoId = await deleteIncomeKeepingUndo(userId, id);
  if (!undoId) throw new NotFoundError();
  await purgeExpired(userId);
  return undoId;
}

const TOO_LATE = "That can't be undone any more.";

const restorers = {
  expense: restoreExpense,
  fixed_item: restoreFixedItem,
  income: restoreIncome,
};

/** Puts back what an undoable delete removed, if it is this user's and still fresh. */
export async function undoDelete(undoId: string) {
  const userId = await currentUserIdOrThrow();
  const kind = await selectUndoKind(userId, undoId, UNDO_WINDOW_MINUTES);
  if (!kind) throw new NotFoundError(TOO_LATE);
  const restored = await restorers[kind](userId, undoId, UNDO_WINDOW_MINUTES);
  if (!restored) throw new NotFoundError(TOO_LATE);
}
