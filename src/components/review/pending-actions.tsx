"use client";

import { Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { RowActions } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import type { PendingExpense } from "@/lib/pending-expenses";
import {
  useApprovePendingExpense,
  useRejectPendingExpense,
  useReplaceBillAndApprove,
  useSetPendingSubscription,
} from "@/mutations/pending-expenses";
import { PendingEditDialog } from "./pending-edit-dialog";

/**
 * Approve, plus Edit / Reject in the row menu. An item that pays a fixed bill
 * whose amount differs (or is an estimate) also gets Replace: the bill takes
 * this charge's amount. Either way it's one item, the bill's payment.
 */
export function PendingActions({ item }: { item: PendingExpense }) {
  const approve = useApprovePendingExpense();
  const replace = useReplaceBillAndApprove();
  const reject = useRejectPendingExpense();
  const subscription = useSetPendingSubscription();
  const linked = Boolean(item.fixedItemId);
  const canReplace =
    linked &&
    (item.fixedItemIsEstimate ||
      (item.fixedItemAmountCents != null &&
        item.fixedItemAmountCents !== item.amountCents));
  const isBill = linked || item.isSubscription === true;

  return (
    <div className="flex items-center gap-1">
      {canReplace ? (
        <Button
          size="sm"
          variant="outline"
          disabled={replace.isPending}
          title={`Change ${item.fixedItemName ?? "the bill"} from ${formatMoney(item.fixedItemAmountCents ?? 0)} to ${formatMoney(item.amountCents)} and mark it paid`}
          onClick={() =>
            replace.mutate(item.id, {
              onSuccess: () => toast.success("Bill updated and marked paid"),
              onError: (error) => toast.error(error.message),
            })
          }
        >
          <RefreshCw /> Replace
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={subscription.isPending}
        onClick={() =>
          subscription.mutate(
            { id: item.id, subscription: !isBill },
            { onError: (error) => toast.error(error.message) },
          )
        }
      >
        {isBill ? "Not a bill" : "Subscription"}
      </Button>
      <Button
        size="sm"
        disabled={approve.isPending}
        onClick={() =>
          approve.mutate(item.id, {
            onSuccess: () =>
              toast.success(
                linked
                  ? "Marked the bill paid"
                  : item.isSubscription
                    ? "Added as a fixed bill"
                    : "Added to your spending",
              ),
            onError: (error) => toast.error(error.message),
          })
        }
      >
        <Check /> Approve
      </Button>
      <RowActions
        label={item.description}
        deleteLabel="Reject"
        renderEdit={(trigger) => (
          <PendingEditDialog item={item} trigger={trigger} />
        )}
        renderDelete={(trigger) => (
          <ConfirmAction
            trigger={trigger}
            title="Reject this item?"
            description={`“${item.description}” won't be added to your spending.`}
            confirmLabel="Reject"
            successMessage="Item rejected"
            mutation={reject}
            variables={item.id}
          />
        )}
      />
    </div>
  );
}
