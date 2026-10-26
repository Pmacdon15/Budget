"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { RowActions } from "@/components/row-actions";
import type { Account } from "@/lib/accounts";
import { useDeleteAccount, useDeleteTransfer } from "@/mutations/accounts";
import { AccountDialog } from "./account-dialog";

/** The account's Edit (and rename) / Delete menu. */
export function AccountActions({ account }: { account: Account }) {
  const remove = useDeleteAccount();
  return (
    <RowActions
      label={account.name}
      renderEdit={(trigger) => (
        <AccountDialog account={account} trigger={trigger} />
      )}
      renderDelete={(trigger) => (
        <ConfirmAction
          trigger={trigger}
          title="Delete this account?"
          description={`“${account.name}” and its statements will be removed. Expenses stay as they are, and transfers keep their other account.`}
          confirmLabel="Delete"
          successMessage="Account deleted"
          mutation={remove}
          variables={account.id}
        />
      )}
    />
  );
}

/** Removes a recorded transfer, which puts both balances back. */
export function DeleteTransferButton({
  id,
  trigger,
}: {
  id: string;
  trigger: React.ReactElement;
}) {
  const remove = useDeleteTransfer();
  return (
    <ConfirmAction
      trigger={trigger}
      title="Delete this transfer?"
      description="Both accounts' balances go back to what they were without it."
      confirmLabel="Delete"
      successMessage="Transfer deleted"
      mutation={remove}
      variables={id}
    />
  );
}
