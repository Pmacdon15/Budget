"use client";

import { useState } from "react";
import { CategorySelect, Field } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import type { BillMatch } from "@/lib/bill-matching";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { makeFixedBillSchema } from "@/lib/schemas/expense-bills";
import type { Expense } from "@/lib/types";
import { useMakeExpenseFixedBill } from "@/mutations/expense-bills";

type Mode = "new" | "existing";

/** True when paying `match`'s bill with this charge would change its amount. */
export function amountChanges(match: BillMatch, amountCents: number) {
  return (
    match.bill.amountCents !== amountCents || Boolean(match.bill.isEstimate)
  );
}

/**
 * "Make fixed bill" for one expense: pre-filled from the expense, saved only
 * when the user confirms. When the expense already looks like one of their
 * bills (the same matching the AI uses), paying that bill is offered first,
 * so the same subscription doesn't become two bills.
 */
export function MakeFixedBillDialog({
  expense,
  match,
  trigger,
}: {
  expense: Expense;
  match: BillMatch | null;
  trigger: React.ReactElement;
}) {
  const mutation = useMakeExpenseFixedBill();
  const [mode, setMode] = useState<Mode>(
    match && match.kind !== "amount_far" ? "existing" : "new",
  );
  const month = monthLabel(expense.month);

  return (
    <FormDialog
      trigger={trigger}
      title="Make it a fixed bill"
      description={`“${expense.description}” (${formatMoney(expense.amountCents)}) becomes ${month}'s payment of a monthly bill, so it counts once instead of as extra spending.`}
      submitLabel={mode === "existing" ? "Mark bill paid" : "Make fixed bill"}
      successMessage={
        mode === "existing" ? "Bill marked paid" : "Fixed bill added"
      }
      schema={makeFixedBillSchema}
      mutation={mutation}
    >
      <input type="hidden" name="expenseId" value={expense.id} />
      <input type="hidden" name="mode" value={mode} />
      {match ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium text-sm">
            This looks like your bill “{match.bill.name}” (
            {formatMoney(match.bill.amountCents)}
            {match.bill.isEstimate ? ", an estimate" : ""}).
          </legend>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="choice"
              className="mt-0.5 size-4 accent-primary"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            <span>
              Mark {match.bill.name} paid for {month} with this charge
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="choice"
              className="mt-0.5 size-4 accent-primary"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            <span>It's a different bill: add a new one</span>
          </label>
        </fieldset>
      ) : null}

      {mode === "existing" && match ? (
        <>
          <input type="hidden" name="fixedItemId" value={match.bill.id} />
          {amountChanges(match, expense.amountCents) ? (
            <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
              <input
                type="checkbox"
                name="updateAmount"
                className="size-4 accent-primary"
                defaultChecked
              />
              Update {match.bill.name} from{" "}
              {formatMoney(match.bill.amountCents)} to{" "}
              {formatMoney(expense.amountCents)} from {month} on
            </label>
          ) : null}
          <FieldError name="fixedItemId" />
        </>
      ) : (
        <NewBillFields expense={expense} />
      )}
    </FormDialog>
  );
}

function NewBillFields({ expense }: { expense: Expense }) {
  return (
    <>
      <Field label="Name" htmlFor="make-bill-name">
        <Input
          id="make-bill-name"
          name="name"
          defaultValue={expense.description}
          required
        />
        <FieldError name="name" />
      </Field>
      <p className="text-muted-foreground text-sm">
        {formatMoney(expense.amountCents)} a month, from{" "}
        {monthLabel(expense.month)}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="make-bill-category">
          <CategorySelect
            id="make-bill-category"
            defaultValue={expense.category}
          />
          <FieldError name="category" />
        </Field>
        <Field label="Due day" htmlFor="make-bill-due" hint="Optional">
          <Input
            id="make-bill-due"
            name="dueDay"
            type="number"
            min={1}
            max={31}
            placeholder="1–31"
            defaultValue={Number(expense.spentOn.slice(8, 10))}
          />
          <FieldError name="dueDay" />
        </Field>
      </div>
      <Field
        label="Shows up as"
        htmlFor="make-bill-keywords"
        hint="Names this bill's charges use, separated by commas, so your AI assistant can match them."
      >
        <Input
          id="make-bill-keywords"
          name="matchKeywords"
          defaultValue={expense.description}
        />
        <FieldError name="matchKeywords" />
      </Field>
    </>
  );
}
