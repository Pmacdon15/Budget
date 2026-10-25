"use client";

import { useMutation } from "@tanstack/react-query";
import {
  deleteExpenseWithUndo,
  deleteIncomeWithUndo,
  stopFixedItemWithUndo,
  type UndoableResult,
  undoDelete,
} from "@/actions/undo";
import { ActionError, unwrap } from "@/mutations/action-error";

/** The undo id from an undoable delete, or a thrown `ActionError`. */
function undoIdOf(result: UndoableResult): string {
  if (!result.ok) throw new ActionError(result.error, result.fieldErrors);
  return result.undoId;
}

/* Each resolves to the undo id that `useUndoDelete` takes. */

export function useDeleteExpenseWithUndo() {
  return useMutation<string, ActionError, string>({
    mutationKey: ["expenses", "delete"],
    mutationFn: async (id) => undoIdOf(await deleteExpenseWithUndo(id)),
  });
}

export function useStopFixedItemWithUndo() {
  return useMutation<string, ActionError, { id: string; fromMonth: string }>({
    mutationKey: ["fixed-items", "stop"],
    mutationFn: async ({ id, fromMonth }) =>
      undoIdOf(await stopFixedItemWithUndo(id, fromMonth)),
  });
}

export function useDeleteIncomeWithUndo() {
  return useMutation<string, ActionError, string>({
    mutationKey: ["income", "delete"],
    mutationFn: async (id) => undoIdOf(await deleteIncomeWithUndo(id)),
  });
}

export function useUndoDelete() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["undo"],
    mutationFn: async (undoId) => unwrap(await undoDelete(undoId)),
  });
}
