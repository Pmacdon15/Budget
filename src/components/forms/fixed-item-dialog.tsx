"use client";

import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { fixedItemSchema } from "@/lib/schemas";
import type { FixedItem } from "@/lib/types";
import { useSaveFixedItem } from "@/mutations/fixed-items";
import { CategorySelect, Field, MoneyInput } from "./fields";
import { FieldError, FormDialog } from "./form-dialog";

export function FixedItemDialog({
  month,
  item,
  trigger,
}: {
  month: string;
  item?: FixedItem;
  trigger: React.ReactElement;
}) {
  const editing = Boolean(item);
  const mutation = useSaveFixedItem(item?.id);

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Edit fixed bill" : "Add a fixed bill"}
      description={
        editing
          ? `Changes apply from ${monthLabel(month)} onward. Earlier months keep their old amount.`
          : `Repeats every month starting ${monthLabel(month)}.`
      }
      submitLabel={editing ? "Save changes" : "Add bill"}
      successMessage={editing ? "Bill updated" : "Bill added"}
      schema={fixedItemSchema}
      mutation={mutation}
    >
      <input type="hidden" name="month" value={month} />
      <FieldError name="month" />
      <Field label="Name" htmlFor="fixed-name">
        <Input
          id="fixed-name"
          name="name"
          placeholder="Rent, phone, car insurance…"
          defaultValue={item?.name}
          required
          autoFocus
        />
        <FieldError name="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount / month" htmlFor="fixed-amount">
          <MoneyInput
            id="fixed-amount"
            name="amount"
            defaultValue={item ? centsToInput(item.amountCents) : undefined}
          />
          <FieldError name="amount" />
        </Field>
        <Field label="Due day" htmlFor="fixed-due" hint="Optional">
          <Input
            id="fixed-due"
            name="dueDay"
            type="number"
            min={1}
            max={31}
            placeholder="1–31"
            defaultValue={item?.dueDay ?? undefined}
          />
          <FieldError name="dueDay" />
        </Field>
      </div>
      <Field label="Category" htmlFor="fixed-category">
        <CategorySelect
          id="fixed-category"
          defaultValue={item?.category ?? "Housing"}
        />
        <FieldError name="category" />
      </Field>
    </FormDialog>
  );
}
