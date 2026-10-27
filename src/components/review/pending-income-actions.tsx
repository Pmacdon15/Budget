"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import type { PendingIncome } from "@/lib/pending-income";
import {
  useApprovePendingIncome,
  useRejectPendingIncome,
} from "@/mutations/pending-income";

/** Approve adds it to take-home; Reject throws it away. */
export function PendingIncomeActions({ item }: { item: PendingIncome }) {
  const approve = useApprovePendingIncome();
  const reject = useRejectPendingIncome();
  return (
    <div className="flex items-center gap-1">
      <ConfirmAction
        trigger={
          <Button size="sm" variant="ghost">
            Reject
          </Button>
        }
        title="Reject this income?"
        description={`“${item.label}” won't be added to your take-home.`}
        confirmLabel="Reject"
        successMessage="Income rejected"
        mutation={reject}
        variables={item.id}
      />
      <Button
        size="sm"
        disabled={approve.isPending}
        onClick={() =>
          approve.mutate(item.id, {
            onSuccess: () => toast.success("Added to take-home"),
            onError: (error) => toast.error(error.message),
          })
        }
      >
        <Check /> Add income
      </Button>
    </div>
  );
}
