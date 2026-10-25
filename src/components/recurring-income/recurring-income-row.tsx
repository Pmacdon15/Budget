"use client";

import { Check, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { RowActions } from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { centsToInput, formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import type { RecurringIncomeForMonth } from "@/lib/recurring-income";
import {
  useRecordRecurringIncome,
  useSkipRecurringIncome,
  useStopRecurringIncome,
  useUnskipRecurringIncome,
} from "@/mutations/recurring-income";
import { RecordDepositDialog } from "./record-deposit-dialog";
import { RecurringIncomeDialog } from "./recurring-income-dialog";

/** One repeating paycheque in the selected month: add it, add a different amount, or skip it. */
export function RecurringIncomeRow({
  month,
  item,
}: {
  month: string;
  item: RecurringIncomeForMonth;
}) {
  const record = useRecordRecurringIncome();
  const skip = useSkipRecurringIncome();
  const unskip = useUnskipRecurringIncome();
  const stop = useStopRecurringIncome();
  const busy = record.isPending || skip.isPending || unskip.isPending;
  const { status } = item;

  const onError = (error: Error) => toast.error(error.message);
  const addUsual = () =>
    record.mutate(
      {
        recurringId: item.id,
        month,
        amount: centsToInput(item.amountCents),
        receivedOn: "",
      },
      { onSuccess: () => toast.success("Take-home added"), onError },
    );
  const skipMonth = () =>
    skip.mutate(
      { recurringId: item.id, month },
      {
        onSuccess: () => toast.success(`Skipped for ${monthLabel(month)}`),
        onError,
      },
    );
  const undoSkip = () =>
    unskip.mutate({ recurringId: item.id, month }, { onError });

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.label}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {status.state === "added"
            ? status.amountCents === item.amountCents
              ? `Added ${formatMoney(status.amountCents)}`
              : `Added ${formatMoney(status.amountCents)} · usually ${formatMoney(item.amountCents)}`
            : status.state === "skipped"
              ? `Skipped this month · usually ${formatMoney(item.amountCents)}`
              : `Usually ${formatMoney(item.amountCents)} · not added yet`}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {status.state === "expected" ? (
          <>
            <Button size="sm" onClick={addUsual} disabled={busy}>
              <Plus /> Add {formatMoney(item.amountCents)}
            </Button>
            <RecordDepositDialog
              month={month}
              item={item}
              trigger={
                <Button size="sm" variant="outline" disabled={busy}>
                  Different amount
                </Button>
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={skipMonth}
              disabled={busy}
            >
              Skip
            </Button>
          </>
        ) : status.state === "skipped" ? (
          <Button size="sm" variant="ghost" onClick={undoSkip} disabled={busy}>
            <Undo2 /> Undo skip
          </Button>
        ) : (
          <Badge variant="secondary">
            <Check /> Added
          </Badge>
        )}
        <RowActions
          label={item.label}
          deleteLabel="Stop repeating"
          renderEdit={(trigger) => (
            <RecurringIncomeDialog
              month={month}
              item={item}
              trigger={trigger}
            />
          )}
          renderDelete={(trigger) => (
            <ConfirmAction
              trigger={trigger}
              title="Stop repeating this take-home?"
              description={`“${item.label}” won't be expected from ${monthLabel(month)} on. Take-home you already added stays.`}
              confirmLabel="Stop repeating"
              successMessage="Stopped repeating"
              mutation={stop}
              variables={{ id: item.id, fromMonth: month }}
            />
          )}
        />
      </div>
    </li>
  );
}
