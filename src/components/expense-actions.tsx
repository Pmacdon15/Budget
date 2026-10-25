"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { RowActions } from "@/components/row-actions";
import { useUndoToast } from "@/components/undo-toast";
import type { Expense } from "@/lib/types";
import { useDeleteExpenseWithUndo } from "@/mutations/undo";

export function ExpenseActions({ expense }: { expense: Expense }) {
  const deleteExpense = useDeleteExpenseWithUndo();
  const showUndo = useUndoToast();
  return (
    <RowActions
      label={expense.description}
      renderEdit={(trigger) => (
        <ExpenseDialog
          month={expense.month}
          expense={expense}
          trigger={trigger}
        />
      )}
      renderDelete={(trigger) => (
        <ConfirmAction
          trigger={trigger}
          title="Delete this expense?"
          description={`“${expense.description}” will be removed.`}
          confirmLabel="Delete"
          successMessage="Expense deleted"
          onSuccess={(undoId) => showUndo("Expense deleted", undoId)}
          mutation={deleteExpense}
          variables={expense.id}
        />
      )}
    />
  );
}
