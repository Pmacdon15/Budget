"use client";

import { ExpenseAccountField } from "@/components/forms/expense-account-field";
import { CategorySelect, Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { needsAccountChoice, requireAccount } from "@/lib/expense-accounts";
import { centsToInput } from "@/lib/money";
import type { PendingExpense } from "@/lib/pending-expenses";
import { expenseSchema } from "@/lib/schemas";
import { useEditPendingExpense } from "@/mutations/pending-expenses";
import { useExpenseAccounts } from "@/queries/expense-accounts";

/**
 * Fix what the AI read before approving it, including which account it was
 * paid from when the user has more than one.
 */
export function PendingEditDialog({
  item,
  trigger,
}: {
  item: PendingExpense;
  trigger: React.ReactElement;
}) {
  const mutation = useEditPendingExpense(item.id);
  const { data: accounts = [] } = useExpenseAccounts();
  const schema = needsAccountChoice(accounts)
    ? requireAccount(expenseSchema)
    : expenseSchema;
  return (
    <FormDialog
      trigger={trigger}
      title="Edit before approving"
      description="Correct anything the AI got wrong. It stays in review until you approve it."
      submitLabel="Save changes"
      successMessage="Changes saved"
      schema={schema}
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
      <ExpenseAccountField
        id={`pending-account-${item.id}`}
        accounts={accounts}
        defaultValue={item.accountId ?? null}
      />
    </FormDialog>
  );
}
