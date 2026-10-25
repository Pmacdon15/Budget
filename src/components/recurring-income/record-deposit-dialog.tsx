"use client";

import { Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { centsToInput, formatMoney } from "@/lib/money";
import { firstDayOf, lastDayOf, monthLabel } from "@/lib/month";
import {
  type RecurringIncome,
  recordRecurringIncomeSchema,
} from "@/lib/recurring-income";
import { useRecordRecurringIncome } from "@/mutations/recurring-income";

/** Adds this month's deposit for a repeating paycheque at a different amount. */
export function RecordDepositDialog({
  month,
  item,
  trigger,
}: {
  month: string;
  item: RecurringIncome;
  trigger: React.ReactElement;
}) {
  const mutation = useRecordRecurringIncome();

  return (
    <FormDialog
      trigger={trigger}
      title={`Add ${item.label}`}
      description={`What actually landed for ${monthLabel(month)}. The usual amount stays ${formatMoney(item.amountCents)} for other months.`}
      submitLabel="Add take-home"
      successMessage="Take-home added"
      schema={recordRecurringIncomeSchema}
      mutation={mutation}
    >
      <input type="hidden" name="recurringId" value={item.id} />
      <input type="hidden" name="month" value={month} />
      <FieldError name="month" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (net)" htmlFor="deposit-amount">
          <MoneyInput
            id="deposit-amount"
            name="amount"
            autoFocus
            defaultValue={centsToInput(item.amountCents)}
          />
          <FieldError name="amount" />
        </Field>
        <Field label="Received" htmlFor="deposit-date" hint="Optional">
          <Input
            id="deposit-date"
            name="receivedOn"
            type="date"
            min={firstDayOf(month)}
            max={lastDayOf(month)}
          />
          <FieldError name="receivedOn" />
        </Field>
      </div>
    </FormDialog>
  );
}
