"use client";

import { Sparkles, Split } from "lucide-react";
import { useState } from "react";
import {
  ReceiptPicker,
  type ScannedReceipt,
} from "@/components/receipt-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Category, isCategory } from "@/lib/categories";
import { rememberedCategory } from "@/lib/merchant-memory";
import { centsToInput } from "@/lib/money";
import { currentMonth, monthLabel, monthOfDate, today } from "@/lib/month";
import { expenseWithReceiptSchema } from "@/lib/schemas";
import type { Expense } from "@/lib/types";
import {
  DuplicateExpenseError,
  useAddExpenseWarningDuplicates,
} from "@/mutations/duplicate-expenses";
import { useSaveExpense } from "@/mutations/expenses";
import { useMerchantMemory } from "@/queries/merchant-memory";
import { CategorySelect, Field, MoneyInput } from "./fields";
import { FieldError, FormDialog } from "./form-dialog";
import { MerchantCategoryHint } from "./merchant-category-hint";
import { type SplitDraft, SplitEditor } from "./split-editor";

export type { ScannedReceipt };

const cents = (value: number | undefined) =>
  value === undefined ? "" : centsToInput(value);

export function ExpenseDialog({
  month,
  expense,
  scan: scanProp,
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
  const save = useSaveExpense(expense?.id);
  // A new expense is checked against saved ones first; see duplicate-expenses.
  const add = useAddExpenseWarningDuplicates();
  const mutation = editing ? save : add;
  const duplicate = mutation.error instanceof DuplicateExpenseError;
  // A new expense can also be scanned from inside the form.
  const [scan, setScan] = useState(scanProp);

  const description = editing
    ? "One-off spending like groceries, gas or a night out."
    : scan
      ? scan.unavailable
        ? "Receipt reading isn't available right now. Fill in the details; the photo is still saved with it."
        : scan.recognised
          ? "Read from your receipt — check the details, then save."
          : "Couldn't make out this receipt. Fill in the details; the photo is still saved with it."
      : "One-off spending like groceries, gas or a night out.";

  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        // Reopening "Add expense" starts blank again.
        if (!next) setScan(scanProp);
        onOpenChange?.(next);
      }}
      title={
        editing ? "Edit expense" : scan ? "Scanned receipt" : "Add an expense"
      }
      description={description}
      submitLabel={
        editing ? "Save changes" : duplicate ? "Save anyway" : "Add expense"
      }
      successMessage={
        editing ? "Expense updated" : scan ? "Receipt saved" : "Expense added"
      }
      schema={expenseWithReceiptSchema}
      mutation={mutation}
    >
      {editing || scan ? null : <ReceiptPicker onScanned={setScan} />}
      {/* Keyed so a new scan resets every field to what was read. */}
      <ExpenseFields
        key={scan?.image ?? "manual"}
        month={month}
        expense={expense}
        scan={scan}
      />
    </FormDialog>
  );
}

function ExpenseFields({
  month,
  expense,
  scan,
}: {
  month: string;
  expense?: Expense;
  scan?: ScannedReceipt;
}) {
  const editing = Boolean(expense);
  const read = scan?.fields;
  const fallbackDate = month === currentMonth() ? today() : `${month}-01`;
  // A scanned receipt counts in the month of the date read off it, never the
  // month on screen. When no date could be read there is no honest default:
  // the field starts empty and the form asks for the receipt's date, rather
  // than silently filing the receipt under the month being viewed.
  const defaultDate =
    expense?.spentOn ?? (scan ? (read?.purchasedOn ?? "") : fallbackDate);

  const defaultAmount = expense
    ? centsToInput(expense.amountCents)
    : read?.totalCents !== undefined
      ? centsToInput(read.totalCents)
      : undefined;
  const defaultCategory: Category =
    (expense && isCategory(expense.category) ? expense.category : undefined) ??
    read?.category ??
    "Groceries";
  const suggestedSplit = !editing && (read?.splits?.length ?? 0) > 1;

  // Merchant memory: a new expense starts on the category picked last time
  // for this merchant, until the user picks one themselves.
  const [descriptionText, setDescriptionText] = useState(
    expense?.description ?? read?.merchant ?? "",
  );
  const { data: memory } = useMerchantMemory(!editing);
  const suggestion = editing
    ? undefined
    : rememberedCategory(memory, descriptionText, read?.merchant);
  const [picked, setPicked] = useState<Category | null>(null);
  const category = picked ?? suggestion?.category ?? defaultCategory;

  // The total as typed, so the split editor can show what's left to assign.
  const [total, setTotal] = useState(defaultAmount ?? "");
  const [splitting, setSplitting] = useState(suggestedSplit);
  const initialSplit: SplitDraft[] = suggestedSplit
    ? (read?.splits ?? []).map((s) => ({
        category: s.category,
        amount: centsToInput(s.amountCents),
      }))
    : [
        { category, amount: total },
        {
          category: category === "Alcohol" ? "Groceries" : "Alcohol",
          amount: "",
        },
      ];

  return (
    <div className="contents">
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
            {read?.purchasedOn && monthOfDate(read.purchasedOn) !== month ? (
              <span className="text-muted-foreground">
                Dated {read.purchasedOn} — counts in{" "}
                {monthLabel(monthOfDate(read.purchasedOn))}, not{" "}
                {monthLabel(month)}.
              </span>
            ) : null}
            {!read?.purchasedOn ? (
              <span className="text-muted-foreground">
                No date could be read — enter the date on the receipt so it
                counts in the right month.
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
          onChange={(e) => setDescriptionText(e.target.value)}
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
            defaultValue={defaultAmount}
            onValueChange={setTotal}
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
      {splitting ? (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Split across categories</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSplitting(false)}
            >
              One category
            </Button>
          </div>
          <SplitEditor total={total} initial={initialSplit} />
        </div>
      ) : (
        <Field label="Category" htmlFor="expense-category">
          <CategorySelect
            id="expense-category"
            value={category}
            onValueChange={setPicked}
          />
          <FieldError name="category" />
          <MerchantCategoryHint
            suggestion={suggestion}
            current={category}
            readerGuess={read?.category}
            onUse={setPicked}
          />
          {editing ? null : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto justify-self-start px-0"
              onClick={() => setSplitting(true)}
            >
              <Split /> Split across categories
            </Button>
          )}
        </Field>
      )}
    </div>
  );
}
