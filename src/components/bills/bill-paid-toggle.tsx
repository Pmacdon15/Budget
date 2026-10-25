"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/month";
import { useSetBillPaid } from "@/mutations/bill-payments";

/**
 * Marks one bill paid (or not) for the month being viewed. Optional: the bill
 * counts toward the month either way.
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
  // Show the new state while the change is saving.
  const shown = setPaid.isPending ? (setPaid.variables?.paid ?? paid) : paid;

  const toggle = () =>
    setPaid.mutate(
      { fixedItemId, month, paid: !shown },
      { onError: (error) => toast.error(error.message) },
    );

  return (
    <Button
      size="sm"
      variant={shown ? "secondary" : "outline"}
      aria-pressed={shown}
      aria-label={
        shown
          ? `${name} is paid for ${monthLabel(month)}. Mark as not paid`
          : `Mark ${name} paid for ${monthLabel(month)}`
      }
      onClick={toggle}
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
  );
}
