"use client";

import { Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { currentMonth, firstDayOf, lastDayOf, today } from "@/lib/month";
import { contributionSchema, type SavingsGoal } from "@/lib/savings-goals";
import { useContributeToGoal } from "@/mutations/savings-goals";

/** Puts money toward a goal, dated in the month being viewed. */
export function ContributeDialog({
  month,
  goal,
  trigger,
}: {
  month: string;
  goal: SavingsGoal;
  trigger: React.ReactElement;
}) {
  const mutation = useContributeToGoal();
  const defaultDate = month === currentMonth() ? today() : firstDayOf(month);

  return (
    <FormDialog
      trigger={trigger}
      title={`Save toward ${goal.name}`}
      description="Saved as Savings spending on that date, so it's counted as money set aside that month."
      submitLabel="Add to goal"
      successMessage="Added to goal"
      schema={contributionSchema}
      mutation={mutation}
    >
      <input type="hidden" name="goalId" value={goal.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="contribution-amount">
          <MoneyInput id="contribution-amount" name="amount" autoFocus />
          <FieldError name="amount" />
        </Field>
        <Field label="Date" htmlFor="contribution-date">
          <Input
            id="contribution-date"
            name="spentOn"
            type="date"
            min={firstDayOf(month)}
            max={lastDayOf(month)}
            defaultValue={defaultDate}
            required
          />
          <FieldError name="spentOn" />
        </Field>
      </div>
    </FormDialog>
  );
}
