"use client";

import { toast } from "sonner";
import { UNDO_TOAST_MS } from "@/lib/undo";
import { useUndoDelete } from "@/mutations/undo";

/**
 * Returns `show(message, undoId)`: a success toast with an Undo button that
 * puts the deleted item back. The row that was deleted has usually unmounted by
 * the time Undo is clicked, so this awaits the mutation directly rather than
 * relying on per-call callbacks that only fire while mounted.
 */
export function useUndoToast() {
  const undo = useUndoDelete();

  return (message: string, undoId: string) => {
    toast.success(message, {
      duration: UNDO_TOAST_MS,
      action: {
        label: "Undo",
        onClick: () => {
          undo.mutateAsync(undoId).then(
            () => toast.success("Restored"),
            (error: Error) => toast.error(error.message),
          );
        },
      },
    });
  };
}
