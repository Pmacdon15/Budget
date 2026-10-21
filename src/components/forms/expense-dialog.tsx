"use client";

import { createExpense, updateExpense } from "@/app/actions";
import { Input } from "@/components/ui/input";
import type { Expense } from "@/lib/data";
import { centsToInput } from "@/lib/money";
import { currentMonth, today } from "@/lib/month";
import { CategorySelect, Field, MoneyInput } from "./fields";
import { FormDialog } from "./form-dialog";

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
  const action = expense ? updateExpense.bind(null, expense.id) : createExpense;
  const defaultDate = expense?.spentOn ?? (month === currentMonth() ? today() : `${month}-01`);

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit expense" : "Add an expense"}
      description="One-off spending like groceries, gas or a night out."
      submitLabel={editing ? "Save changes" : "Add expense"}
      successMessage={editing ? "Expense updated" : "Expense added"}
      action={action}
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
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="expense-amount">
          <MoneyInput
            id="expense-amount"
            name="amount"
            defaultValue={expense ? centsToInput(expense.amountCents) : undefined}
          />
        </Field>
        <Field label="Date" htmlFor="expense-date">
          <Input
            id="expense-date"
            name="spentOn"
            type="date"
            required
            defaultValue={defaultDate}
          />
        </Field>
      </div>
      <Field label="Category" htmlFor="expense-category">
        <CategorySelect id="expense-category" defaultValue={expense?.category ?? "Groceries"} />
      </Field>
    </FormDialog>
  );
}
