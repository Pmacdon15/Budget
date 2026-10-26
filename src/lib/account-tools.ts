import { z } from "zod";
import { MAX_PDF_BASE64 } from "@/lib/statement-pdf";

/*
 * What the MCP account tools take. Amounts are dollars as the AI reads them
 * (e.g. 1250.67), dates YYYY-MM-DD. Shared by the server and its tests.
 */

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

/** A date (YYYY-MM-DD) or a moment with its time zone (2026-10-25T14:30:00-06:00). */
const asOf = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) ||
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(
        value,
      ) &&
        !Number.isNaN(new Date(value).getTime())),
    "Use YYYY-MM-DD, or a date and time with its time zone like 2026-10-25T14:30:00-06:00",
  );

const twoDecimals = (value: number) =>
  Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/** Up to $1 billion either way. Negative for an overdrawn chequing account or a card in credit. */
const signedDollars = z
  .number()
  .min(-1_000_000_000, "That amount is too large")
  .max(1_000_000_000, "That amount is too large")
  .refine(twoDecimals, "Use at most two decimal places");

const nonNegativeDollars = z
  .number()
  .min(0, "Amounts can't be negative")
  .max(1_000_000_000, "That amount is too large")
  .refine(twoDecimals, "Use at most two decimal places");

const positiveDollars = z
  .number()
  .positive("The amount must be more than zero")
  .max(1_000_000_000, "That amount is too large")
  .refine(twoDecimals, "Use at most two decimal places");

const institution = z
  .string()
  .trim()
  .min(2, "Give the bank or card issuer, e.g. RBC")
  .max(80)
  .describe("The bank or card issuer, as the email names it (e.g. RBC, TD).");

const lastFour = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Give the account's last four digits, like 1234")
  .describe("The account or card number's last four digits.");

const accountType = z
  .enum(["chequing", "credit_card", "line_of_credit"])
  .describe(
    "chequing, credit_card or line_of_credit. Credit cards and lines of credit hold what's owed.",
  );

const source = z
  .string()
  .trim()
  .max(300)
  .optional()
  .describe("Where it came from, e.g. the email's sender and subject.");

export const listAccountsInputSchema = z.object({});

export const proposeAccountInputSchema = z.object({
  type: accountType,
  institution,
  last_four: lastFour,
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "A name for it. Leave out to use institution, type and last four (e.g. 'RBC Credit card ••1234').",
    ),
  balance: signedDollars
    .optional()
    .describe(
      "The balance the bank reports, in dollars. For a credit card or line of credit, what's owed.",
    ),
  as_of: asOf
    .optional()
    .describe("When that balance was true. Defaults to now."),
  credit_limit: nonNegativeDollars.optional(),
  available_credit: signedDollars.optional(),
  minimum_payment: nonNegativeDollars.optional(),
  payment_due_date: isoDate.optional(),
  source,
});

/** Which account: its id, or the institution plus last four digits. */
const accountRef = {
  account_id: z
    .uuid()
    .optional()
    .describe("The account's id from list_accounts."),
  institution: institution.optional(),
  last_four: lastFour.optional(),
};

const hasAccountRef = (v: {
  account_id?: string;
  institution?: string;
  last_four?: string;
}) => Boolean(v.account_id || (v.institution && v.last_four));

const refMessage = {
  message: "Give account_id, or institution and last_four",
  path: ["account_id"],
};

export const updateAccountBalanceInputSchema = z
  .object({
    ...accountRef,
    balance: signedDollars.describe(
      "The balance the bank reports, in dollars. Negative when chequing is overdrawn. For a credit card or line of credit, what's owed.",
    ),
    as_of: asOf
      .optional()
      .describe(
        "When the bank says that balance was true: a date (YYYY-MM-DD) or a date and time with its zone. Defaults to now. An older balance never replaces a newer one.",
      ),
    source,
  })
  .refine(hasAccountRef, refMessage);

export const recordStatementInputSchema = z.object({
  account_id: accountRef.account_id,
  institution,
  last_four: lastFour,
  account_type: accountType
    .optional()
    .describe(
      "The account's type. Needed when no account matches, so a new one can be proposed.",
    ),
  closing_date: isoDate.describe("The statement's closing (end) date."),
  balance: signedDollars.describe(
    "The statement's closing balance, in dollars. For a credit card or line of credit, what's owed (the new balance).",
  ),
  minimum_payment: nonNegativeDollars.optional(),
  payment_due_date: isoDate.optional(),
  credit_limit: nonNegativeDollars.optional(),
  available_credit: signedDollars.optional(),
  pdf_base64: z
    .string()
    .max(MAX_PDF_BASE64, "That PDF is too large (3MB at most)")
    .optional()
    .describe(
      "The statement PDF attached to the email, base64-encoded. Saved so the user can download it in Budget.",
    ),
  source,
});

export const recordTransferInputSchema = z
  .object({
    from_account_id: z
      .uuid()
      .describe("The account the money left, from list_accounts."),
    to_account_id: z
      .uuid()
      .describe("The account it went to (e.g. the credit card paid)."),
    amount: positiveDollars.describe("How much moved, in dollars."),
    date: isoDate.describe("The day it moved, YYYY-MM-DD."),
    description: z.string().trim().max(120).optional(),
    source,
    allow_duplicate: z
      .boolean()
      .optional()
      .describe(
        "Only after the user said a transfer with the same accounts, amount and day is a separate one.",
      ),
  })
  .refine((t) => t.from_account_id !== t.to_account_id, {
    message: "The two accounts must be different",
    path: ["to_account_id"],
  });

export type ProposeAccountInput = z.output<typeof proposeAccountInputSchema>;
export type UpdateAccountBalanceInput = z.output<
  typeof updateAccountBalanceInputSchema
>;
export type RecordStatementInput = z.output<typeof recordStatementInputSchema>;
export type RecordTransferInput = z.output<typeof recordTransferInputSchema>;
