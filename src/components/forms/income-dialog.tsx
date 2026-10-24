"use client";

import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { firstDayOf, lastDayOf, monthLabel } from "@/lib/month";
import { incomeSchema } from "@/lib/schemas";
import type { IncomeEntry } from "@/lib/types";
import { useSaveIncome } from "@/mutations/income";
import { Field, MoneyInput } from "./fields";
import { FieldError, FormDialog } from "./form-dialog";

export function IncomeDialog({
  month,
  entry,
  suggestion,
  trigger,
}: {
  month: string;
  entry?: IncomeEntry;
  /** Prefills a new entry from the most recent paycheque. */
  suggestion?: { label: string; amountCents: number } | null;
  trigger: React.ReactElement;
}) {
  const editing = Boolean(entry);
  const mutation = useSaveIncome(entry?.id);
  const label = entry?.label ?? suggestion?.label;
  const amount = entry?.amountCents ?? suggestion?.amountCents;

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit take-home" : "Add take-home pay"}
      description={`Net pay that landed in your account for ${monthLabel(entry?.month ?? month)}. Add each paycheque separately if you're paid more than once.`}
      submitLabel={editing ? "Save changes" : "Add take-home"}
      successMessage={editing ? "Take-home updated" : "Take-home added"}
      schema={incomeSchema}
      mutation={mutation}
    >
      <input type="hidden" name="month" value={entry?.month ?? month} />
      <FieldError name="month" />
      <Field label="Source" htmlFor="income-label">
        <Input
          id="income-label"
          name="label"
          placeholder="Paycheque, side job…"
          defaultValue={label}
          required
        />
        <FieldError name="label" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (net)" htmlFor="income-amount">
          <MoneyInput
            id="income-amount"
            name="amount"
            autoFocus
            defaultValue={
              amount !== undefined ? centsToInput(amount) : undefined
            }
          />
          <FieldError name="amount" />
        </Field>
        <Field label="Received" htmlFor="income-date" hint="Optional">
          <Input
            id="income-date"
            name="receivedOn"
            type="date"
            min={firstDayOf(entry?.month ?? month)}
            max={lastDayOf(entry?.month ?? month)}
            defaultValue={entry?.receivedOn ?? undefined}
          />
          <FieldError name="receivedOn" />
        </Field>
      </div>
    </FormDialog>
  );
}
