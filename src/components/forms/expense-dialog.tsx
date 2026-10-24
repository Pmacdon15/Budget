"use client";

import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { currentMonth, today } from "@/lib/month";
import { expenseSchema } from "@/lib/schemas";
import type { Expense } from "@/lib/types";
import { useSaveExpense } from "@/mutations/expenses";
import { CategorySelect, Field, MoneyInput } from "./fields";
import { FieldError, FormDialog } from "./form-dialog";

export function ExpenseDialog({
  month,
  expense,
  trigger,
}: {
  month: string;
  expense?: Expense;
  trigger: React.ReactElement;
}) {
  const editing = Boolean(expense);
  const mutation = useSaveExpense(expense?.id);
  const defaultDate =
    expense?.spentOn ?? (month === currentMonth() ? today() : `${month}-01`);

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit expense" : "Add an expense"}
      description="One-off spending like groceries, gas or a night out."
      submitLabel={editing ? "Save changes" : "Add expense"}
      successMessage={editing ? "Expense updated" : "Expense added"}
      schema={expenseSchema}
      mutation={mutation}
    >
      <Field label="Description" htmlFor="expense-description">
        <Input
          id="expense-description"
          name="description"
          placeholder="Costco run"
          defaultValue={expense?.description}
          required
          autoFocus
        />
        <FieldError name="description" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="expense-amount">
          <MoneyInput
            id="expense-amount"
            name="amount"
            defaultValue={
              expense ? centsToInput(expense.amountCents) : undefined
            }
          />
          <FieldError name="amount" />
        </Field>
        <Field label="Date" htmlFor="expense-date">
          <Input
            id="expense-date"
            name="spentOn"
            type="date"
            required
            defaultValue={defaultDate}
          />
          <FieldError name="spentOn" />
        </Field>
      </div>
      <Field label="Category" htmlFor="expense-category">
        <CategorySelect
          id="expense-category"
          defaultValue={expense?.category ?? "Groceries"}
        />
        <FieldError name="category" />
      </Field>
    </FormDialog>
  );
}
