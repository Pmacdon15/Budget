"use client";

import { Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { firstDayOf } from "@/lib/month";
import { type SavingsGoal, savingsGoalSchema } from "@/lib/savings-goals";
import { useSaveSavingsGoal } from "@/mutations/savings-goals";

/** Adds a savings goal starting in `month`, or edits `goal`. */
export function GoalDialog({
  month,
  goal,
  trigger,
}: {
  month: string;
  goal?: SavingsGoal;
  trigger: React.ReactElement;
}) {
  const editing = Boolean(goal);
  const mutation = useSaveSavingsGoal(goal?.id);

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit goal" : "Add a savings goal"}
      description="Something to save toward. Money you put toward it is saved as Savings spending, so it counts as set aside in that month."
      submitLabel={editing ? "Save changes" : "Add goal"}
      successMessage={editing ? "Goal updated" : "Goal added"}
      schema={savingsGoalSchema}
      mutation={mutation}
    >
      <input type="hidden" name="month" value={goal?.startMonth ?? month} />
      <FieldError name="month" />
      <Field label="Name" htmlFor="goal-name">
        <Input
          id="goal-name"
          name="name"
          placeholder="Emergency fund, trip, new car…"
          defaultValue={goal?.name}
          required
          autoFocus
        />
        <FieldError name="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target" htmlFor="goal-target">
          <MoneyInput
            id="goal-target"
            name="target"
            defaultValue={goal ? centsToInput(goal.targetCents) : undefined}
          />
          <FieldError name="target" />
        </Field>
        <Field label="Reach it by" htmlFor="goal-date" hint="Optional">
          <Input
            id="goal-date"
            name="targetDate"
            type="date"
            min={firstDayOf(goal?.startMonth ?? month)}
            defaultValue={goal?.targetDate ?? undefined}
          />
          <FieldError name="targetDate" />
        </Field>
      </div>
    </FormDialog>
  );
}
