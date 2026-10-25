"use client";

import { Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import {
  type RecurringIncome,
  recurringIncomeSchema,
} from "@/lib/recurring-income";
import { useSaveRecurringIncome } from "@/mutations/recurring-income";

/** Sets up a repeating paycheque from `month`, or edits `item`. */
export function RecurringIncomeDialog({
  month,
  item,
  suggestion,
  trigger,
}: {
  month: string;
  item?: RecurringIncome;
  /** Prefills a new one from the most recent paycheque. */
  suggestion?: { label: string; amountCents: number } | null;
  trigger: React.ReactElement;
}) {
  const editing = Boolean(item);
  const mutation = useSaveRecurringIncome(item?.id);
  const label = item?.label ?? suggestion?.label;
  const amount = item?.amountCents ?? suggestion?.amountCents;

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit repeating take-home" : "Repeat take-home monthly"}
      description={
        editing
          ? "Changes the usual name and amount for months you haven't added yet. Deposits you already added keep theirs."
          : `Expected every month from ${monthLabel(month)}. It only counts once you add it each month, so you can change the amount or skip a month.`
      }
      submitLabel={editing ? "Save changes" : "Start repeating"}
      successMessage={
        editing
          ? "Repeating take-home updated"
          : "Take-home will repeat monthly"
      }
      schema={recurringIncomeSchema}
      mutation={mutation}
    >
      <input type="hidden" name="month" value={month} />
      <FieldError name="month" />
      <Field label="Source" htmlFor="recurring-label">
        <Input
          id="recurring-label"
          name="label"
          placeholder="Paycheque, side job…"
          defaultValue={label}
          required
        />
        <FieldError name="label" />
      </Field>
      <Field
        label="Usual amount (net)"
        htmlFor="recurring-amount"
        hint="Per month. You can add a different amount any month."
      >
        <MoneyInput
          id="recurring-amount"
          name="amount"
          autoFocus
          defaultValue={amount !== undefined ? centsToInput(amount) : undefined}
        />
        <FieldError name="amount" />
      </Field>
    </FormDialog>
  );
}
