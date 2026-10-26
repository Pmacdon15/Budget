"use client";

import { Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transferSchema } from "@/lib/accounts";
import { useCreateTransfer } from "@/mutations/accounts";

type Option = { id: string; name: string };

function AccountSelect({
  id,
  name,
  accounts,
  defaultValue,
}: {
  id: string;
  name: string;
  accounts: Option[];
  defaultValue?: string;
}) {
  const label = (value: string | null) =>
    accounts.find((a) => a.id === value)?.name ?? null;
  return (
    <Select name={name} defaultValue={defaultValue}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Pick an account">{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Records money moved between two accounts, e.g. a credit card payment from
 * chequing. It changes both balances and is never counted as spending.
 */
export function TransferDialog({
  accounts,
  today,
  trigger,
}: {
  accounts: Option[];
  today: string;
  trigger: React.ReactElement;
}) {
  const mutation = useCreateTransfer();
  return (
    <FormDialog
      trigger={trigger}
      title="Record a transfer"
      description="Money moved between your own accounts, like paying a credit card from chequing. It isn't an expense, so it's never counted as spending."
      submitLabel="Record transfer"
      successMessage="Transfer recorded"
      schema={transferSchema}
      mutation={mutation}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="transfer-from">
          <AccountSelect
            id="transfer-from"
            name="fromAccountId"
            accounts={accounts}
            defaultValue={accounts[0]?.id}
          />
          <FieldError name="fromAccountId" />
        </Field>
        <Field label="To" htmlFor="transfer-to">
          <AccountSelect
            id="transfer-to"
            name="toAccountId"
            accounts={accounts}
            defaultValue={accounts[1]?.id}
          />
          <FieldError name="toAccountId" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="transfer-amount">
          <MoneyInput id="transfer-amount" name="amount" />
          <FieldError name="amount" />
        </Field>
        <Field label="Date" htmlFor="transfer-date">
          <Input
            id="transfer-date"
            name="transferredOn"
            type="date"
            defaultValue={today}
            required
          />
          <FieldError name="transferredOn" />
        </Field>
      </div>
      <Field label="Description" htmlFor="transfer-description" hint="Optional">
        <Input
          id="transfer-description"
          name="description"
          placeholder="Visa payment"
        />
        <FieldError name="description" />
      </Field>
    </FormDialog>
  );
}
