"use client";

import { Field, SignedMoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { type BankBalance, bankBalanceSchema } from "@/lib/bank-balance";
import { centsToInput } from "@/lib/money";
import { useSetBankBalance } from "@/mutations/bank-balance";

/** Enter or update what's in the bank right now. Negative means overdrawn. */
export function BankBalanceDialog({
  balance,
  trigger,
}: {
  balance: BankBalance | null;
  trigger: React.ReactElement;
}) {
  const mutation = useSetBankBalance();

  return (
    <FormDialog
      trigger={trigger}
      title={balance ? "Update bank balance" : "Add bank balance"}
      description="What your account shows right now. If you're overdrawn, enter it as a negative amount (tap ± or type a minus)."
      submitLabel="Save balance"
      successMessage="Bank balance saved"
      schema={bankBalanceSchema}
      mutation={mutation}
    >
      <Field
        label="Current balance"
        htmlFor="bank-balance"
        hint="For example 1250.00, or -75.00 when overdrawn."
      >
        <SignedMoneyInput
          id="bank-balance"
          name="balance"
          defaultValue={balance ? centsToInput(balance.balanceCents) : ""}
          autoFocus
        />
        <FieldError name="balance" />
      </Field>
    </FormDialog>
  );
}
