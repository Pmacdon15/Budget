import { formatMoney } from "@/lib/money";
import type { ExpenseFormValues } from "@/lib/schemas";

/**
 * An expense already saved that looks like the one being added: same date,
 * same total, and the same description or receipt merchant. A receipt split
 * across categories counts as one expense, with its parts added together.
 */
export type DuplicateExpense = {
  description: string;
  spentOn: string;
  amountCents: number;
  /** True when the saved one came from a scanned receipt. */
  scanned: boolean;
};

/** What the duplicate check compares; built from the parsed add-expense form. */
export type DuplicateCheck = {
  spentOn: string;
  amountCents: number;
  description: string;
  merchant: string | null;
};

const dateLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** The warning shown above the form's button, which then reads "Save anyway". */
export function duplicateWarning(match: DuplicateExpense) {
  const when = dateLabel.format(new Date(`${match.spentOn}T00:00:00Z`));
  const what = match.scanned ? "a scanned receipt" : "an expense";
  return `This looks like ${what} you already saved: ${match.description}, ${formatMoney(match.amountCents)} on ${when}. Save anyway to add it again.`;
}

/**
 * The form values the warning was about. Submitting the same values again
 * means "save anyway"; changing any of them checks again.
 */
export function duplicateKey(values: ExpenseFormValues) {
  return JSON.stringify([
    values.description.trim().toLowerCase(),
    values.amount.trim(),
    values.spentOn,
    values.receiptMerchant?.trim().toLowerCase() ?? "",
  ]);
}
