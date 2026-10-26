import { z } from "zod";
import { formatMoney } from "@/lib/money";
import {
  dollars,
  isoDate,
  label,
  receiptInputSchema,
} from "@/lib/pending-expenses";
import type { ReceiptKind } from "@/lib/receipt-files";

/*
 * Income an AI assistant found (an e-Transfer someone sent the user, a direct
 * deposit, a client's payment) and submitted through the MCP server. It waits
 * on the Review page until the user approves it (it becomes a take-home
 * entry) or rejects it. Shared by browser and server.
 */

export type PendingIncome = {
  id: string;
  receivedOn: string;
  /** What it shows as on the Take-home page, e.g. "Drift Landscaping". */
  label: string;
  /** Who sent the money, when the AI gave one. */
  payer: string | null;
  amountCents: number;
  /** The account it went into; null means the primary chequing account. */
  accountId: string | null;
  accountName: string | null;
  /** Where the AI found it, e.g. an email's sender and subject. */
  source: string | null;
  /** Which AI app submitted it. */
  client: string | null;
  createdAt: string;
  /** A take-home entry on the same day has the same amount. */
  possibleDuplicate: boolean;
  hasReceipt: boolean;
  receiptKind: ReceiptKind | null;
};

/** Income already recorded (or waiting for review) that looks like a new one. */
export type IncomeDuplicateMatch = {
  kind: "income" | "pending";
  id: string;
  label: string;
  receivedOn: string;
  amountCents: number;
};

/** "Possible duplicate: Drift Landscaping, $1,450.00 on 2026-10-14 (already saved)". */
export function incomeDuplicateMessage(match: IncomeDuplicateMatch) {
  const where =
    match.kind === "income" ? "already saved" : "already waiting for review";
  return `Possible duplicate: ${match.label}, ${formatMoney(match.amountCents)} on ${match.receivedOn} (${where}).`;
}

/** What `add_income` takes. Amounts are dollars, e.g. 1450.00. */
export const addIncomeInputSchema = z.object({
  amount: dollars.describe(
    "How much came in, in dollars, as a positive number, e.g. 1450.00.",
  ),
  date: isoDate.describe(
    "The day the money was sent or deposited, as YYYY-MM-DD (the email's date).",
  ),
  payer: label("Payer").describe(
    "Who sent the money, as the email names them, e.g. 'DRIFT LANDSCAPING LTD'.",
  ),
  label: label("Label")
    .optional()
    .describe(
      "How it shows on the Take-home page, e.g. 'Drift Landscaping'. Defaults to the payer.",
    ),
  account_id: z
    .uuid()
    .optional()
    .describe(
      "The chequing or savings account it went into, from list_accounts. Leave out for the primary chequing account.",
    ),
  source: z
    .string()
    .trim()
    .max(300, "Source is too long")
    .optional()
    .describe(
      "Where you found it, e.g. \"notify@payments.interac.ca: 'DRIFT LANDSCAPING LTD sent you $1,450.00'\".",
    ),
  allow_duplicate: z
    .boolean()
    .optional()
    .describe(
      "Only set true after the user said a flagged possible duplicate is a separate payment.",
    ),
  receipt: receiptInputSchema
    .optional()
    .describe(
      "The email as proof of the payment: its amount and text, plus its PDF attachment, or the email itself (receipt.email.html or text) when it has no attachment, as for add_expense. An e-Transfer notice has no attachment, so send the email itself.",
    ),
});

export type AddIncomeInput = z.output<typeof addIncomeInputSchema>;

/** What `list_income` takes. */
export const listIncomeInputSchema = z.object({
  from: isoDate
    .optional()
    .describe("First day to include, as YYYY-MM-DD. Defaults to 31 days ago."),
  to: isoDate
    .optional()
    .describe("Last day to include, as YYYY-MM-DD. Defaults to today."),
});
