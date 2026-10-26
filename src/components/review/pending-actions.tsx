"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { RowActions } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import type { PendingExpense } from "@/lib/pending-expenses";
import {
  useApprovePendingExpense,
  useRejectPendingExpense,
} from "@/mutations/pending-expenses";
import { PendingEditDialog } from "./pending-edit-dialog";

/** Approve, plus Edit / Reject in the row menu. */
export function PendingActions({ item }: { item: PendingExpense }) {
  const approve = useApprovePendingExpense();
  const reject = useRejectPendingExpense();

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        disabled={approve.isPending}
        onClick={() =>
          approve.mutate(item.id, {
            onSuccess: () => toast.success("Added to your spending"),
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
