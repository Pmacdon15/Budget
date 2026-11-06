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
  CASH_ACCOUNT_ID,
  CASH_LABEL,
  type ExpenseAccountOption,
  expenseAccountLabel,
  needsAccountChoice,
  offersAccountChoice,
} from "@/lib/expense-accounts";

/**
 * "Paid from": which account an expense came out of, or cash. Shown whenever
 * the user has an account, so cash can always be picked: a cash expense
 * counts as spending but never comes off any balance. With more than one
 * account a new expense starts with nothing picked, so the account is always
 * a choice the user made, never a guess; with one it starts on that account.
 * The error line is always there, so a refusal from the server still shows
 * even if the picker couldn't load.
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
  if (!offersAccountChoice(accounts)) return <FieldError name="accountId" />;

  const several = needsAccountChoice(accounts);
  const label = (value: string | null) => {
    if (value === CASH_ACCOUNT_ID) return CASH_LABEL;
    const account = accounts.find((a) => a.id === value);
    // Nothing picked yet shows the prompt (a render function replaces the placeholder).
    return account ? expenseAccountLabel(account) : "Choose an account";
  };
  const known =
    defaultValue === CASH_ACCOUNT_ID ||
    accounts.some((a) => a.id === defaultValue);
  const initial = known
    ? defaultValue
    : several
      ? null
      : (accounts[0]?.id ?? null);

  return (
    <Field
      label="Paid from"
      htmlFor={id}
      hint={
        several
          ? "You have more than one account, so confirm which one this came out of. Cash never comes off a balance."
          : "Cash counts as spending but never comes off a balance."
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
          <SelectItem value={CASH_ACCOUNT_ID}>{CASH_LABEL}</SelectItem>
        </SelectContent>
      </Select>
      <FieldError name="accountId" />
    </Field>
  );
}
