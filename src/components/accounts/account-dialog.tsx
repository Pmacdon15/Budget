"use client";

import { useState } from "react";
import { Field, SignedMoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCOUNT_TYPES,
  type Account,
  accountSchema,
  accountTypeLabel,
  isDebtType,
} from "@/lib/accounts";
import { centsToInput } from "@/lib/money";
import { useSaveAccount } from "@/mutations/accounts";

type FormType = (typeof ACCOUNT_TYPES)[number];

const money = (cents: number | null | undefined) =>
  cents == null ? "" : centsToInput(cents);

/** Adds an account, or edits (and renames) `account`. */
export function AccountDialog({
  account,
  trigger,
}: {
  account?: Account;
  trigger: React.ReactElement;
}) {
  const editing = Boolean(account);
  const mutation = useSaveAccount(account?.id);
  const [type, setType] = useState<FormType>(
    account && account.type !== "savings" ? account.type : "chequing",
  );
  const debt = isDebtType(type);

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit account" : "Add an account"}
      description="A chequing account, credit card or line of credit. Only chequing counts toward what's left to spend."
      submitLabel={editing ? "Save changes" : "Add account"}
      successMessage={editing ? "Account updated" : "Account added"}
      schema={accountSchema}
      mutation={mutation}
    >
      <Field label="Name" htmlFor="account-name">
        <Input
          id="account-name"
          name="name"
          placeholder="Everyday chequing, Visa…"
          defaultValue={account?.name}
          required
          autoFocus
        />
        <FieldError name="name" />
      </Field>
      <Field label="Type" htmlFor="account-type">
        <Select
          name="type"
          value={type}
          onValueChange={(next) => {
            if (ACCOUNT_TYPES.includes(next as FormType)) {
              setType(next as FormType);
            }
          }}
        >
          <SelectTrigger id="account-type" className="w-full">
            <SelectValue>
              {(value: string | null) =>
                value ? accountTypeLabel(value) : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {accountTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError name="type" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Institution"
          htmlFor="account-institution"
          hint="Optional"
        >
          <Input
            id="account-institution"
            name="institution"
            placeholder="RBC, TD, Tangerine…"
            defaultValue={account?.institution ?? undefined}
          />
          <FieldError name="institution" />
        </Field>
        <Field
          label="Last four digits"
          htmlFor="account-last-four"
          hint="Optional"
        >
          <Input
            id="account-last-four"
            name="lastFour"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            defaultValue={account?.lastFour ?? undefined}
          />
          <FieldError name="lastFour" />
        </Field>
      </div>
      <Field
        label={debt ? "Balance owed" : "Current balance"}
        htmlFor="account-balance"
        hint={
          debt
            ? "What you owe now. Higher means you owe more."
            : "What the account shows now. Negative if overdrawn."
        }
      >
        <SignedMoneyInput
          id="account-balance"
          name="balance"
          defaultValue={account ? centsToInput(account.balanceCents) : ""}
        />
        <FieldError name="balance" />
      </Field>
      {debt ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Credit limit" htmlFor="account-limit" hint="Optional">
              <Input
                id="account-limit"
                name="creditLimit"
                inputMode="decimal"
                defaultValue={money(account?.creditLimitCents)}
              />
              <FieldError name="creditLimit" />
            </Field>
            <Field
              label="Available credit"
              htmlFor="account-available"
              hint="Optional"
            >
              <Input
                id="account-available"
                name="availableCredit"
                inputMode="decimal"
                defaultValue={money(account?.availableCreditCents)}
              />
              <FieldError name="availableCredit" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Statement balance"
              htmlFor="account-statement"
              hint="Optional"
            >
              <Input
                id="account-statement"
                name="statementBalance"
                inputMode="decimal"
                defaultValue={money(account?.statementBalanceCents)}
              />
              <FieldError name="statementBalance" />
            </Field>
            <Field
              label="Minimum payment"
              htmlFor="account-minimum"
              hint="Optional"
            >
              <Input
                id="account-minimum"
                name="minimumPayment"
                inputMode="decimal"
                defaultValue={money(account?.minimumPaymentCents)}
              />
              <FieldError name="minimumPayment" />
            </Field>
          </div>
          <Field label="Payment due" htmlFor="account-due" hint="Optional">
            <Input
              id="account-due"
              name="paymentDueDate"
              type="date"
              defaultValue={account?.paymentDueDate ?? undefined}
            />
            <FieldError name="paymentDueDate" />
          </Field>
        </>
      ) : (
        <>
          <input type="hidden" name="isPrimary" value="off" />
          <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
            <input
              type="checkbox"
              name="isPrimary"
              className="size-4 accent-primary"
              defaultChecked={account?.isPrimary ?? false}
              disabled={account?.isPrimary}
            />
            Main chequing account (fixed bills you mark paid come off it)
          </label>
          {account?.isPrimary ? (
            <input type="hidden" name="isPrimary" value="on" />
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
