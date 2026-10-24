"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { RowActions } from "@/components/row-actions";
import type { Expense } from "@/lib/types";
import { useDeleteExpense } from "@/mutations/expenses";

export function ExpenseActions({ expense }: { expense: Expense }) {
  const deleteExpense = useDeleteExpense();
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
          mutation={deleteExpense}
          variables={expense.id}
        />
      )}
    />
  );
}
