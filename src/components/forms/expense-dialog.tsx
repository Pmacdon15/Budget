"use client";

import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { currentMonth, today } from "@/lib/month";
import { expenseWithReceiptSchema } from "@/lib/schemas";
import type { Expense, ScanResponse } from "@/lib/types";
import { useSaveExpense } from "@/mutations/expenses";
import { CategorySelect, Field, MoneyInput } from "./fields";
import { FieldError, FormDialog } from "./form-dialog";

/** A finished scan: what the server returned plus a local preview of the photo. */
export type ScannedReceipt = ScanResponse & { previewUrl: string };

const cents = (value: number | undefined) =>
  value === undefined ? "" : centsToInput(value);

export function ExpenseDialog({
  month,
  expense,
  scan,
  trigger,
  open,
  onOpenChange,
}: {
  month: string;
  expense?: Expense;
  /** Pre-fills a new expense from a scanned receipt and saves the receipt with it. */
  scan?: ScannedReceipt;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const editing = Boolean(expense);
  const mutation = useSaveExpense(expense?.id);
  const read = scan?.fields;
  const fallbackDate = month === currentMonth() ? today() : `${month}-01`;
  const defaultDate = expense?.spentOn ?? read?.purchasedOn ?? fallbackDate;

  const description = editing
    ? "One-off spending like groceries, gas or a night out."
    : scan
      ? scan.recognised
        ? "Read from your receipt — check the details, then save."
        : "Couldn't read this receipt. Fill in the details and the photo is saved with it."
      : "One-off spending like groceries, gas or a night out.";

  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={
        editing ? "Edit expense" : scan ? "Scanned receipt" : "Add an expense"
      }
      description={description}
      submitLabel={editing ? "Save changes" : "Add expense"}
      successMessage={
        editing ? "Expense updated" : scan ? "Receipt saved" : "Expense added"
      }
      schema={expenseWithReceiptSchema}
      mutation={mutation}
    >
      {scan ? (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-2">
          {/* biome-ignore lint/performance/noImgElement: a local object URL, nothing for next/image to optimize. */}
          <img
            src={scan.previewUrl}
            alt="Receipt"
            className="h-20 w-16 shrink-0 rounded object-cover"
          />
          <div className="grid gap-0.5 text-xs">
            {scan.recognised ? (
              <span className="flex items-center gap-1 font-medium">
                <Sparkles className="size-3.5" /> Filled in by AI
              </span>
            ) : (
              <span className="font-medium">Photo attached</span>
            )}
            {read?.merchant ? <span>{read.merchant}</span> : null}
            {read?.subtotalCents !== undefined ||
            read?.taxCents !== undefined ? (
              <span className="text-muted-foreground tabular-nums">
                {read?.subtotalCents !== undefined
                  ? `Subtotal $${cents(read.subtotalCents)}`
                  : null}
                {read?.subtotalCents !== undefined &&
                read?.taxCents !== undefined
                  ? " · "
                  : null}
                {read?.taxCents !== undefined
                  ? `Tax $${cents(read.taxCents)}`
                  : null}
              </span>
            ) : null}
          </div>
          <input type="hidden" name="receiptImage" value={scan.image} />
          <input
            type="hidden"
            name="receiptMerchant"
            value={read?.merchant ?? ""}
          />
          <input
            type="hidden"
            name="receiptPurchasedOn"
            value={read?.purchasedOn ?? ""}
          />
          <input
            type="hidden"
            name="receiptSubtotal"
            value={cents(read?.subtotalCents)}
          />
          <input
            type="hidden"
            name="receiptTax"
            value={cents(read?.taxCents)}
          />
          <input
            type="hidden"
            name="receiptTotal"
            value={cents(read?.totalCents)}
          />
          <input type="hidden" name="receiptText" value={read?.rawText ?? ""} />
        </div>
      ) : null}
      <Field label="Description" htmlFor="expense-description">
        <Input
          id="expense-description"
          name="description"
          placeholder="Costco run"
          defaultValue={expense?.description ?? read?.merchant}
          required
          autoFocus
        />
        <FieldError name="description" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="expense-amount">
          <MoneyInput
            id="expense-amount"
            name="amount"
            defaultValue={
              expense
                ? centsToInput(expense.amountCents)
                : read?.totalCents !== undefined
                  ? centsToInput(read.totalCents)
                  : undefined
            }
          />
          <FieldError name="amount" />
        </Field>
        <Field label="Date" htmlFor="expense-date">
          <Input
            id="expense-date"
            name="spentOn"
            type="date"
            required
            defaultValue={defaultDate}
          />
          <FieldError name="spentOn" />
        </Field>
      </div>
      <Field label="Category" htmlFor="expense-category">
        <CategorySelect
          id="expense-category"
          defaultValue={expense?.category ?? read?.category ?? "Groceries"}
        />
        <FieldError name="category" />
      </Field>
    </FormDialog>
  );
}
