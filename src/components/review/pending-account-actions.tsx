"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import type { PendingAccount } from "@/lib/accounts";
import {
  useApprovePendingAccount,
  useRejectPendingAccount,
} from "@/mutations/accounts";

/** Approve creates the account the AI proposed; Reject throws it away. */
export function PendingAccountActions({ item }: { item: PendingAccount }) {
  const approve = useApprovePendingAccount();
  const reject = useRejectPendingAccount();
  return (
    <div className="flex items-center gap-1">
      <ConfirmAction
        trigger={
          <Button size="sm" variant="ghost">
            Reject
          </Button>
        }
        title="Reject this account?"
        description={`“${item.name}” won't be added${item.statementClosingDate ? ", and its statement is discarded" : ""}.`}
        confirmLabel="Reject"
        successMessage="Account rejected"
        mutation={reject}
        variables={item.id}
      />
      <Button
        size="sm"
        disabled={approve.isPending}
        onClick={() =>
          approve.mutate(item.id, {
            onSuccess: () => toast.success("Account added"),
            onError: (error) => toast.error(error.message),
          })
        }
      >
        <Check /> Add account
      </Button>
    </div>
  );
}
