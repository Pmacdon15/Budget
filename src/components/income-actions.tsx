"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { RowActions } from "@/components/row-actions";
import { useUndoToast } from "@/components/undo-toast";
import type { IncomeEntry } from "@/lib/types";
import { useDeleteIncomeWithUndo } from "@/mutations/undo";

export function IncomeActions({ entry }: { entry: IncomeEntry }) {
  const deleteIncome = useDeleteIncomeWithUndo();
  const showUndo = useUndoToast();
  return (
    <RowActions
      label={entry.label}
      renderEdit={(trigger) => (
        <IncomeDialog month={entry.month} entry={entry} trigger={trigger} />
      )}
      renderDelete={(trigger) => (
        <ConfirmAction
          trigger={trigger}
          title="Delete this take-home entry?"
          description={`“${entry.label}” will be removed from this month.`}
          confirmLabel="Delete"
          successMessage="Take-home deleted"
          onSuccess={(undoId) => showUndo("Take-home deleted", undoId)}
          mutation={deleteIncome}
          variables={entry.id}
        />
      )}
    />
  );
}
