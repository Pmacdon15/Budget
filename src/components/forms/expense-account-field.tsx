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
  CASH,
  CASH_LABEL,
  type ExpenseAccountOption,
  expenseAccountLabel,
  isCash,
  needsAccountChoice,
  offersAccountChoice,
} from "@/lib/expense-accounts";

/**
 * "Paid from": which account an expense came out of, or Cash. Shown whenever
 * the user has an account, so cash can be picked: cash counts as spending but
 * comes off no balance. With several accounts a new expense starts with
 * nothing picked, so the account is always a choice the user made, never a
 * guess; with one, it starts on that account. The error line is always
 * there, so a refusal from the server still shows even if the picker
 * couldn't load.
 */
export function ExpenseAccountField({
  id,
  accounts,
  defaultValue,
}: {
  id: string;
  accounts: ExpenseAccountOption[];
  /** The account already set (editing, or CASH), or nothing for a new expense. */
  defaultValue?: string | null;
}) {
  if (!offersAccountChoice(accounts)) return <FieldError name="accountId" />;

  const label = (value: string | null) => {
    if (isCash(value)) return CASH_LABEL;
    const account = accounts.find((a) => a.id === value);
    // Nothing picked yet shows the prompt (a render function replaces the placeholder).
    return account ? expenseAccountLabel(account) : "Choose an account";
  };
  const several = needsAccountChoice(accounts);
  const known =
    isCash(defaultValue) || accounts.some((a) => a.id === defaultValue);
  // With one account there's nothing to confirm: it starts on that one.
  const initial = known
    ? (defaultValue ?? null)
    : several
      ? null
      : (accounts[0]?.id ?? null);

  return (
    <Field
      label="Paid from"
      htmlFor={id}
      hint={
        several
          ? "You have more than one account, so confirm which one this came out of. Cash comes off no account."
          : "Cash counts as spending but comes off no account."
      }
    >
      <Select name="accountId" defaultValue={initial}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {expenseAccountLabel(a)}
            </SelectItem>
          ))}
          <SelectItem value={CASH}>{CASH_LABEL}</SelectItem>
        </SelectContent>
      </Select>
      <FieldError name="accountId" />
    </Field>
  );
}
