"use client";

import { CalendarSync } from "lucide-react";
import { MakeFixedBillDialog } from "@/components/expense-bills/make-fixed-bill-dialog";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { RowActions } from "@/components/row-actions";
import { useUndoToast } from "@/components/undo-toast";
import type { BillMatch } from "@/lib/bill-matching";
import type { Expense } from "@/lib/types";
import { useDeleteExpenseWithUndo } from "@/mutations/undo";

export function ExpenseActions({
  expense,
  billMatch = null,
}: {
  expense: Expense;
  /** A fixed bill this expense already looks like, offered first by "Make fixed bill". */
  billMatch?: BillMatch | null;
}) {
  const deleteExpense = useDeleteExpenseWithUndo();
  const showUndo = useUndoToast();
  // Already a bill's payment, or not paid yet: it can't become one now.
  const canMakeBill = !expense.fixedItemId && !expense.unpaid;
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
      extra={
        canMakeBill
          ? {
              label: "Make fixed bill",
              icon: <CalendarSync />,
              render: (trigger) => (
                <MakeFixedBillDialog
                  expense={expense}
                  match={billMatch}
                  trigger={trigger}
                />
              ),
            }
          : undefined
      }
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
