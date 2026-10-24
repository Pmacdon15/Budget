"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { RowActions } from "@/components/row-actions";
import type { IncomeEntry } from "@/lib/types";
import { useDeleteIncome } from "@/mutations/income";

export function IncomeActions({ entry }: { entry: IncomeEntry }) {
  const deleteIncome = useDeleteIncome();
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
          mutation={deleteIncome}
          variables={entry.id}
        />
      )}
    />
  );
}
