import { z } from "zod";
import { CATEGORY_NAMES } from "@/lib/categories";
import { formatMoney } from "@/lib/money";

/*
 * Expenses an AI assistant submitted through the MCP server. They wait on the
 * Review page until the user approves (they become normal expenses) or rejects
 * them. Shared by browser and server.
 */

export type PendingExpense = {
  id: string;
  spentOn: string;
  description: string;
  /** Who was paid, when the AI gave one. */
  merchant: string | null;
  category: string;
  amountCents: number;
  /** Where the AI found it, e.g. an email's sender and subject. */
  source: string | null;
  /** Which AI app submitted it. */
  client: string | null;
  createdAt: string;
  /** A saved expense on the same day has the same amount. */
  possibleDuplicate: boolean;
};

/** An expense or pending item that looks like a new one: same day, same amount. */
export type DuplicateMatch = {
  kind: "expense" | "pending";
  id: string;
  description: string;
  spentOn: string;
  amountCents: number;
};

/** Upper bound for one expense the AI can add: $1,000,000. */
const MAX_AMOUNT = 1_000_000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date as YYYY-MM-DD")
  .refine((value) => {
    // Date rolls "2026-02-31" over to March 3rd, so compare the round trip.
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "That date doesn't exist");

const dollars = z
  .number()
  .positive("The amount must be more than zero")
  .max(MAX_AMOUNT, "That amount is too large")
  .refine(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
    "Use at most two decimal places",
  );

const label = (name: string) =>
  z
    .string()
    .trim()
    .min(1, `${name} is required`)
    .max(120, `${name} is too long`);

/** Dollars (as the AI sends them) to integer cents. */
export const toCents = (amount: number) => Math.round(amount * 100);

/** What `add_expense` takes. Amounts are dollars, e.g. 45.67. */
export const addExpenseInputSchema = z.object({
  amount: dollars.describe(
    "Total charged, in dollars, as a positive number, e.g. 45.67.",
  ),
  date: isoDate.describe("The day the money was spent, as YYYY-MM-DD."),
  merchant: label("Merchant").describe(
    "Who was paid, e.g. 'Shell' or 'Amazon'.",
  ),
  description: label("Description")
    .optional()
    .describe("A short description. Defaults to the merchant."),
  category: z
    .enum(CATEGORY_NAMES)
    .describe(
      "The category the user confirmed. Call list_categories for the options.",
    ),
  source: z
    .string()
    .trim()
    .max(300, "Source is too long")
    .optional()
    .describe(
      "Where you found it, e.g. \"Email from receipts@shell.ca: 'Your receipt'\".",
    ),
  allow_duplicate: z
    .boolean()
    .optional()
    .describe(
      "Only set true after the user said a flagged possible duplicate is a separate charge.",
    ),
});

export type AddExpenseInput = z.output<typeof addExpenseInputSchema>;

/** What `sync_bank_balance` takes. */
export const syncBankBalanceInputSchema = z.object({
  balance: z
    .number()
    .min(-1_000_000_000, "That balance is too large")
    .max(1_000_000_000, "That balance is too large")
    .describe(
      "The balance the bank reported, in dollars. Negative when overdrawn.",
    ),
  source: z
    .string()
    .trim()
    .max(300)
    .optional()
    .describe("Where the balance came from, e.g. the alert email's subject."),
});

/** What `edit_expense` takes: the id plus only the fields that change. */
export const editExpenseInputSchema = z.object({
  id: z.uuid().describe("The expense's id, from list_expenses."),
  amount: dollars.optional().describe("New total, in dollars."),
  date: isoDate.optional().describe("New date, as YYYY-MM-DD."),
  description: label("Description").optional(),
  category: z.enum(CATEGORY_NAMES).optional(),
});

export const deleteExpenseInputSchema = z.object({
  id: z.uuid().describe("The expense's id, from list_expenses."),
});

export const listExpensesInputSchema = z.object({
  from: isoDate
    .optional()
    .describe("First day to include, as YYYY-MM-DD. Defaults to 31 days ago."),
  to: isoDate
    .optional()
    .describe("Last day to include, as YYYY-MM-DD. Defaults to today."),
});

/** "Possible duplicate: Shell, $45.67 on 2026-10-20 (already saved)". */
export function duplicateMessage(match: DuplicateMatch) {
  const where =
    match.kind === "expense" ? "already saved" : "already waiting for review";
  return `Possible duplicate: ${match.description}, ${formatMoney(match.amountCents)} on ${match.spentOn} (${where}).`;
}
