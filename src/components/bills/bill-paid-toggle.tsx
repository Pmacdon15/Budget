"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/month";
import { useSetBillPaid } from "@/mutations/bill-payments";

/**
 * Marks one bill paid (or not) for the month being viewed. Optional: the bill
 * counts toward the month either way.
 *
 * Marking paid asks whether the money came off the bank account: if it did,
 * the amount comes off the bank balance; if it didn't, the mark is
 * bookkeeping only and the balance doesn't move. Unmarking is one click.
 */
export function BillPaidToggle({
  fixedItemId,
  name,
  month,
  paid,
}: {
  fixedItemId: string;
  name: string;
  month: string;
  paid: boolean;
}) {
  const setPaid = useSetBillPaid();
  const [asking, setAsking] = useState(false);
  // Show the new state while the change is saving.
  const shown = setPaid.isPending ? (setPaid.variables?.paid ?? paid) : paid;

  const unmark = () =>
    setPaid.mutate(
      { fixedItemId, month, paid: false },
      { onError: (error) => toast.error(error.message) },
    );

  const markPaid = (offBankAccount: boolean) =>
    setPaid.mutate(
      { fixedItemId, month, paid: true, offBankAccount },
      {
        onSuccess: () => setAsking(false),
        onError: (error) => toast.error(error.message),
      },
    );

  return (
    <>
      <Button
        size="sm"
        variant={shown ? "secondary" : "outline"}
        aria-pressed={shown}
        aria-label={
          shown
            ? `${name} is paid for ${monthLabel(month)}. Mark as not paid`
            : `Mark ${name} paid for ${monthLabel(month)}`
        }
        onClick={shown ? unmark : () => setAsking(true)}
        disabled={setPaid.isPending}
      >
        {shown ? (
          <>
            <Check /> Paid
          </>
        ) : (
          "Mark paid"
        )}
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {name} paid for {monthLabel(month)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Did the money come off your bank account? If it did, the amount
              comes off your bank balance. If it didn&rsquo;t — you paid another
              way, or you&rsquo;re just recording it — the bill is marked paid
              and your balance stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setPaid.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => markPaid(false)}
              disabled={setPaid.isPending}
            >
              No — just mark it paid
            </Button>
            <Button onClick={() => markPaid(true)} disabled={setPaid.isPending}>
              {setPaid.isPending ? "Working…" : "Yes — it came off"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
