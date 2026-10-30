"use client";

import { Field } from "@/components/forms/fields";
import { FieldError } from "@/components/forms/form-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ExpenseAccountOption,
  expenseAccountLabel,
  needsAccountChoice,
} from "@/lib/expense-accounts";

/**
 * "Paid from": which account an expense came out of. Shown only when the user
 * has more than one account; with one there's nothing to confirm. A new
 * expense starts with nothing picked, so the account is always a choice the
 * user made, never a guess. The error line is always there, so a refusal from
 * the server still shows even if the picker couldn't load.
 */
export function ExpenseAccountField({
  id,
  accounts,
  defaultValue,
}: {
  id: string;
  accounts: ExpenseAccountOption[];
  /** The account already set (editing), or nothing for a new expense. */
  defaultValue?: string | null;
}) {
  if (!needsAccountChoice(accounts)) return <FieldError name="accountId" />;

  const label = (value: string | null) => {
    const account = accounts.find((a) => a.id === value);
    // Nothing picked yet shows the prompt (a render function replaces the placeholder).
    return account ? expenseAccountLabel(account) : "Choose an account";
  };
  const known = accounts.some((a) => a.id === defaultValue);

  return (
    <Field
      label="Paid from"
      htmlFor={id}
      hint="You have more than one account, so confirm which one this came out of."
    >
      <Select name="accountId" defaultValue={known ? defaultValue : null}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {expenseAccountLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError name="accountId" />
    </Field>
  );
}
