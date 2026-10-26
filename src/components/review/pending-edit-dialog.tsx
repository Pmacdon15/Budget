"use client";

import { CategorySelect, Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import type { PendingExpense } from "@/lib/pending-expenses";
import { expenseSchema } from "@/lib/schemas";
import { useEditPendingExpense } from "@/mutations/pending-expenses";

/** Fix what the AI read before approving it. */
export function PendingEditDialog({
  item,
  trigger,
}: {
  item: PendingExpense;
  trigger: React.ReactElement;
}) {
  const mutation = useEditPendingExpense(item.id);
  return (
    <FormDialog
      trigger={trigger}
      title="Edit before approving"
      description="Correct anything the AI got wrong. It stays in review until you approve it."
      submitLabel="Save changes"
      successMessage="Changes saved"
      schema={expenseSchema}
      mutation={mutation}
    >
      <Field label="Description" htmlFor={`pending-description-${item.id}`}>
        <Input
          id={`pending-description-${item.id}`}
          name="description"
          defaultValue={item.description}
          required
        />
        <FieldError name="description" />
      </Field>
      <Field label="Category" htmlFor={`pending-category-${item.id}`}>
        <CategorySelect
          id={`pending-category-${item.id}`}
          defaultValue={item.category}
        />
        <FieldError name="category" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor={`pending-amount-${item.id}`}>
          <MoneyInput
            id={`pending-amount-${item.id}`}
            name="amount"
            defaultValue={centsToInput(item.amountCents)}
          />
          <FieldError name="amount" />
        </Field>
        <Field label="Date" htmlFor={`pending-date-${item.id}`}>
          <Input
            id={`pending-date-${item.id}`}
            name="spentOn"
            type="date"
            defaultValue={item.spentOn}
            required
          />
          <FieldError name="spentOn" />
        </Field>
      </div>
    </FormDialog>
  );
}
