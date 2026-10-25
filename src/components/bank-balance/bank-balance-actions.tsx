"use client";

import { Pencil, Plus } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { RowActions } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import type { BankBalance } from "@/lib/bank-balance";
import { useClearBankBalance } from "@/mutations/bank-balance";
import { BankBalanceDialog } from "./bank-balance-dialog";

/** "Add" before there's a balance; "Update" plus an Edit / Remove menu after. */
export function BankBalanceActions({
  balance,
}: {
  balance: BankBalance | null;
}) {
  const clear = useClearBankBalance();

  if (!balance) {
    return (
      <BankBalanceDialog
        balance={null}
        trigger={
          <Button size="sm">
            <Plus /> Add balance
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex items-center gap-1">
      <BankBalanceDialog
        balance={balance}
        trigger={
          <Button size="sm" variant="outline">
            <Pencil /> Update
          </Button>
        }
      />
      <RowActions
        label="Bank balance"
        deleteLabel="Remove"
        renderEdit={(trigger) => (
          <BankBalanceDialog balance={balance} trigger={trigger} />
        )}
        renderDelete={(trigger) => (
          <ConfirmAction
            trigger={trigger}
            title="Remove your bank balance?"
            description="It won't show on the Overview until you add it again. Nothing else changes."
            confirmLabel="Remove"
            successMessage="Bank balance removed"
            mutation={clear}
            variables={undefined}
          />
        )}
      />
    </div>
  );
}
