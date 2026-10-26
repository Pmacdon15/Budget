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
  /** Not paid yet: once approved, it stays off the bank balance until marked paid. */
  unpaid: boolean;
  /** The AI attached a receipt (details read off an email, maybe a photo). */
  hasReceipt: boolean;
  /** The fixed bill it pays, if the AI matched one: approving marks that month paid. */
  fixedItemId?: string | null;
  fixedItemName?: string | null;
  /** That bill's amount in the item's month. */
  fixedItemAmountCents?: number | null;
  /** That bill's amount is the user's estimate. */
  fixedItemIsEstimate?: boolean;
  /** A subscription: with no bill, approving makes it a new fixed bill. Null: unknown. */
  isSubscription?: boolean | null;
};

/** What an AI read off an emailed receipt, kept with the expense like a scan. */
export type ReceiptDetails = {
  merchant: string | null;
  purchasedOn: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  rawText: string | null;
  /** A JPEG photo of the receipt in the private store, when the email had one. */
  imagePathname: string | null;
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

const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the month as YYYY-MM");

const nonNegativeDollars = z
  .number()
  .min(0, "Amounts can't be negative")
  .max(MAX_AMOUNT, "That amount is too large")
  .refine(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
    "Use at most two decimal places",
  );

/** About 3MB once decoded, the same limit as a scanned photo. */
const MAX_IMAGE_BASE64 = 4_200_000;

/** A receipt read off an email: what it says, and optionally a JPEG of it. */
export const receiptInputSchema = z.object({
  merchant: z.string().trim().max(120).optional(),
  purchased_on: isoDate
    .optional()
    .describe("The date on the receipt, YYYY-MM-DD."),
  subtotal: nonNegativeDollars.optional().describe("Before tax, in dollars."),
  tax: nonNegativeDollars.optional().describe("Tax, in dollars."),
  total: nonNegativeDollars.optional().describe("Total, in dollars."),
  text: z
    .string()
    .max(4000, "Keep the receipt text under 4,000 characters")
    .optional()
    .describe(
      "The receipt's text, e.g. the line items from the email or its PDF.",
    ),
  image_jpeg_base64: z
    .string()
    .max(MAX_IMAGE_BASE64, "That image is too large (3MB at most)")
    .optional()
    .describe(
      "A JPEG photo or scan of the receipt, base64-encoded. JPEG only; for a PDF receipt send its text instead.",
    ),
});

export type ReceiptInput = z.output<typeof receiptInputSchema>;

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
  unpaid: z
    .boolean()
    .optional()
    .describe(
      "True when it hasn't been paid yet (e.g. an order waiting on a bank transfer). It stays off the bank balance until mark_expense_paid.",
    ),
  receipt: receiptInputSchema
    .optional()
    .describe(
      "The receipt, when the email is one: its details and optionally a JPEG.",
    ),
  is_subscription: z
    .union([z.boolean(), z.literal("unknown")])
    .optional()
    .describe(
      "true when the email says it repeats (subscription, monthly plan, auto-renewal) or the user says so: approving it makes it a fixed bill. false for usage charges, credits and one-offs (e.g. API credits, prepaid extra usage): it's never matched to a fixed bill. 'unknown' (the default) when you can't tell: ask the user.",
    ),
  fixed_bill_id: z
    .uuid()
    .optional()
    .describe(
      "The fixed bill this charge pays, from find_matching_fixed_bill or list_fixed_bills, once the user agreed. Approving marks that month paid instead of adding separate spending.",
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

/** What `attach_receipt` takes: a saved expense or a pending item, and the receipt. */
export const attachReceiptInputSchema = receiptInputSchema
  .extend({
    expense_id: z
      .uuid()
      .optional()
      .describe("A saved expense's id, from list_expenses."),
    pending_id: z
      .uuid()
      .optional()
      .describe(
        "An id from list_expenses' pending_review, or from add_expense.",
      ),
  })
  .refine(
    (value) => Boolean(value.expense_id) !== Boolean(value.pending_id),
    "Give exactly one of expense_id or pending_id",
  );

export const markExpensePaidInputSchema = z.object({
  id: z
    .uuid()
    .describe(
      "The unpaid expense's id, or a pending item's id, from list_expenses.",
    ),
  paid_on: isoDate.describe("The day the payment went out, YYYY-MM-DD."),
});

export const listFixedBillsInputSchema = z.object({
  month: yearMonth
    .optional()
    .describe("Which month's bills, as YYYY-MM. Defaults to this month."),
});

const dueDay = z
  .number()
  .int("The due day must be a whole number")
  .min(1, "The due day must be between 1 and 31")
  .max(31, "The due day must be between 1 and 31");

const matchKeywords = z
  .array(z.string().trim().min(1).max(60))
  .max(10, "Give at most 10 names")
  .describe(
    "Names this bill's charges show up under, e.g. ['Google Play', 'Google One'], so later charges match it.",
  );

const merchantName = z
  .string()
  .trim()
  .max(120)
  .describe("Who charges it, as it shows on the email or statement.");

export const addFixedBillInputSchema = z.object({
  name: label("Name").describe("e.g. 'Internet' or 'Google AI Pro'."),
  category: z
    .enum(CATEGORY_NAMES)
    .describe(
      "The category the user confirmed. Call list_categories for the options.",
    ),
  amount: dollars.describe("The monthly amount, in dollars, tax included."),
  due_day: dueDay.optional().describe("Day of the month it's charged, 1-31."),
  start_month: yearMonth
    .optional()
    .describe(
      "The first month it applies to, YYYY-MM. Defaults to this month.",
    ),
  merchant: merchantName.optional(),
  match_keywords: matchKeywords.optional(),
  is_estimate: z
    .boolean()
    .optional()
    .describe(
      "True when the amount is a guess; the first real charge replaces it.",
    ),
});

export const editFixedBillInputSchema = z.object({
  id: z.uuid().describe("The bill's id, from list_fixed_bills."),
  from_month: yearMonth
    .optional()
    .describe(
      "The first month the change applies to, YYYY-MM: usually the month of the bill that showed the new price. Earlier months keep the old values (that's the bill's amount history). Defaults to this month.",
    ),
  amount: dollars.optional().describe("New monthly amount, in dollars."),
  name: label("Name").optional(),
  category: z.enum(CATEGORY_NAMES).optional(),
  due_day: dueDay
    .nullable()
    .optional()
    .describe("New due day, or null for none."),
  merchant: merchantName.nullable().optional(),
  match_keywords: matchKeywords.optional(),
  is_estimate: z
    .boolean()
    .optional()
    .describe(
      "false once the amount is real. Changing the amount clears it unless you pass true.",
    ),
});

export const markBillPaidInputSchema = z.object({
  id: z.uuid().describe("The bill's id, from list_fixed_bills."),
  month: yearMonth.describe("The month that was paid, YYYY-MM."),
  paid_on: isoDate
    .optional()
    .describe(
      "The day the money left, YYYY-MM-DD. With it (and no expense_id) the bill comes off the bank balance like an expense.",
    ),
  expense_id: z
    .uuid()
    .optional()
    .describe(
      "A saved expense that is this bill's payment (from list_expenses): it's linked to the bill, so it counts once. This is how to merge a standalone expense into a fixed bill.",
    ),
  update_amount: z
    .boolean()
    .optional()
    .describe(
      "With expense_id: also set the bill's amount to that expense's, from this month on, and clear the estimate flag. Only after the user agreed.",
    ),
});

/** What `find_matching_fixed_bill` takes. */
export const findMatchingFixedBillInputSchema = z.object({
  merchant: label("Merchant").describe("Who charged it, e.g. 'Google Play'."),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("What it was for, e.g. 'Google One AI Premium (monthly)'."),
  amount: dollars.describe("The amount charged, in dollars."),
  date: isoDate.describe("The day it was charged, YYYY-MM-DD."),
  tolerance_percent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "How far the amount may be from a bill's and still count as that bill at a new price. Default 15.",
    ),
});

/** A saved expense or an item waiting for review: exactly one. */
const oneExpense = {
  expense_id: z
    .uuid()
    .optional()
    .describe("A saved expense's id, from list_expenses."),
  pending_id: z
    .uuid()
    .optional()
    .describe("An id from list_expenses' pending_review, or from add_expense."),
};

const exactlyOne = (value: { expense_id?: string; pending_id?: string }) =>
  Boolean(value.expense_id) !== Boolean(value.pending_id);

export const convertExpenseToFixedBillInputSchema = z
  .object({
    ...oneExpense,
    name: label("Name").optional().describe("Defaults to the expense's."),
    category: z.enum(CATEGORY_NAMES).optional(),
    due_day: dueDay.optional().describe("Defaults to the day it was charged."),
    merchant: merchantName.optional(),
    match_keywords: matchKeywords.optional(),
  })
  .refine(exactlyOne, "Give exactly one of expense_id or pending_id");

export const unlinkFixedBillInputSchema = z
  .object(oneExpense)
  .refine(exactlyOne, "Give exactly one of expense_id or pending_id");

/** "Possible duplicate: Shell, $45.67 on 2026-10-20 (already saved)". */
export function duplicateMessage(match: DuplicateMatch) {
  const where =
    match.kind === "expense" ? "already saved" : "already waiting for review";
  return `Possible duplicate: ${match.description}, ${formatMoney(match.amountCents)} on ${match.spentOn} (${where}).`;
}
