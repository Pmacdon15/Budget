import { z } from "zod";
import { formatMoney, parseMoney, parseSignedMoney } from "@/lib/money";
import { TIME_ZONE } from "@/lib/month";

/*
 * The user's accounts: chequing, credit cards and lines of credit. Shared by
 * browser and server.
 *
 * Signs: a chequing balance is money in the account (below zero when
 * overdrawn). A credit card or line of credit balance is what's owed, so a
 * higher balance means the user owes more.
 */

/** Savings is reserved for later: the database accepts it, the forms don't offer it yet. */
export const ACCOUNT_TYPES = [
  "chequing",
  "credit_card",
  "line_of_credit",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number] | "savings";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  chequing: "Chequing",
  credit_card: "Credit card",
  line_of_credit: "Line of credit",
  savings: "Savings",
};

export const accountTypeLabel = (type: string) =>
  ACCOUNT_TYPE_LABELS[type as AccountType] ?? type;

export const isAccountType = (value: unknown): value is AccountType =>
  typeof value === "string" && value in ACCOUNT_TYPE_LABELS;

/** Credit cards and lines of credit: the balance is what's owed. */
export const isDebtType = (type: string) =>
  type === "credit_card" || type === "line_of_credit";

export type Account = {
  id: string;
  type: AccountType;
  name: string;
  institution: string | null;
  lastFour: string | null;
  /** The chequing account expenses and paid bills come off. */
  isPrimary: boolean;
  /**
   * The balance now: what was entered (or reported), less the expenses that
   * came off it since (primary account only), adjusted by transfers since.
   * For debt accounts, what's owed.
   */
  balanceCents: number;
  /** The balance as it was last entered or reported. */
  enteredCents: number;
  /** Expenses and paid bills that came off it since (primary account only). */
  spentSinceCents: number;
  /** What transfers since then changed it by, in the account's own sign. */
  transfersSinceCents: number;
  /** When the entered balance was true, as an ISO timestamp. */
  balanceAsOf: string;
  /** manual, alert, statement, migrated, or another note from the AI. */
  balanceSource: string | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  statementBalanceCents: number | null;
  statementClosingDate: string | null;
  paymentDueDate: string | null;
  minimumPaymentCents: number | null;
  createdAt: string;
};

export type AccountStatement = {
  id: string;
  accountId: string;
  closingDate: string;
  balanceCents: number;
  minimumPaymentCents: number | null;
  paymentDueDate: string | null;
  hasPdf: boolean;
  source: string | null;
  createdAt: string;
};

export type AccountTransfer = {
  id: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromName: string | null;
  toName: string | null;
  amountCents: number;
  transferredOn: string;
  description: string | null;
  source: string | null;
  createdAt: string;
};

/** An account an AI proposed, waiting on the Review page. */
export type PendingAccount = {
  id: string;
  type: AccountType;
  name: string;
  institution: string | null;
  lastFour: string | null;
  balanceCents: number | null;
  balanceAsOf: string | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  statementClosingDate: string | null;
  statementBalanceCents: number | null;
  paymentDueDate: string | null;
  minimumPaymentCents: number | null;
  hasStatementPdf: boolean;
  source: string | null;
  client: string | null;
  createdAt: string;
};

/* ---------- Pure helpers ---------- */

/** All chequing accounts combined, or null when there are none. Debt accounts never count. */
export function netChequingCents(
  accounts: Pick<Account, "type" | "balanceCents">[],
): number | null {
  const chequing = accounts.filter((a) => a.type === "chequing");
  if (chequing.length === 0) return null;
  return chequing.reduce((total, a) => total + a.balanceCents, 0);
}

/** What's owed on credit cards and lines of credit, combined. */
export function totalOwedCents(
  accounts: Pick<Account, "type" | "balanceCents">[],
): number {
  return accounts
    .filter((a) => isDebtType(a.type))
    .reduce((total, a) => total + a.balanceCents, 0);
}

/** "rbcroyalbank" from "RBC Royal Bank®": lower case, letters and digits only. */
export function normalizeInstitution(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The same bank, allowing for a longer or shorter name ("TD" and "TD Canada
 * Trust", "Scotia" and "Scotiabank"). Two letters at least, so a stray
 * initial doesn't match everything.
 */
export function institutionsMatch(a: string | null, b: string | null) {
  const x = normalizeInstitution(a);
  const y = normalizeInstitution(b);
  if (x.length < 2 || y.length < 2) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export type AccountMatch<T> =
  /** Exactly one account has this institution and last four. */
  | { kind: "match"; account: T }
  /** More than one does: ask the user which. */
  | { kind: "ambiguous"; accounts: T[] }
  /** None does. `similar` shares the last four at another institution. */
  | { kind: "none"; similar: T[] };

/** Finds the account a statement or alert is for, by institution plus last four digits. */
export function matchAccount<
  T extends Pick<Account, "institution" | "lastFour" | "type">,
>(
  accounts: T[],
  query: { institution: string; lastFour: string; type?: AccountType },
): AccountMatch<T> {
  const sameFour = accounts.filter((a) => a.lastFour === query.lastFour);
  let matches = sameFour.filter((a) =>
    institutionsMatch(a.institution, query.institution),
  );
  if (matches.length > 1 && query.type) {
    const ofType = matches.filter((a) => a.type === query.type);
    if (ofType.length > 0) matches = ofType;
  }
  if (matches.length === 1 && matches[0]) {
    return { kind: "match", account: matches[0] };
  }
  if (matches.length > 1) return { kind: "ambiguous", accounts: matches };
  return { kind: "none", similar: sameFour };
}

/** "RBC Credit card ••1234": how a proposed account is named. */
export function proposedAccountName(
  institution: string,
  type: AccountType,
  lastFour: string,
) {
  return `${institution.trim()} ${accountTypeLabel(type)} ••${lastFour}`;
}

/** "RBC ••1234", or just the name's institution when there's no number. */
export function accountSubtitle(
  account: Pick<Account, "institution" | "lastFour" | "type">,
) {
  return [
    accountTypeLabel(account.type),
    account.institution,
    account.lastFour ? `••${account.lastFour}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const whenFormat = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Oct 15, 2026" from "2026-10-15". */
export const dateLabel = (date: string) =>
  dayFormat.format(new Date(`${date}T00:00:00Z`));

/** "From the Oct 15, 2026 statement" or "Updated Oct 25, 2:52 p.m.". */
export function balanceAsOfLabel(
  account: Pick<
    Account,
    "balanceAsOf" | "balanceSource" | "statementClosingDate"
  >,
) {
  if (account.balanceSource === "statement" && account.statementClosingDate) {
    return `From the ${dateLabel(account.statementClosingDate)} statement`;
  }
  return `Updated ${whenFormat.format(new Date(account.balanceAsOf))}`;
}

/** "Owed" for a credit card, "Overdrawn" for chequing below zero, else null. */
export function balanceNote(account: Pick<Account, "type" | "balanceCents">) {
  if (isDebtType(account.type)) {
    return account.balanceCents < 0 ? "In credit" : "Owed";
  }
  return account.balanceCents < 0 ? "Overdrawn" : null;
}

/** "$1,250.00 owed" / "$1,250.00" / "-$20.00". */
export function formatBalance(account: Pick<Account, "type" | "balanceCents">) {
  if (isDebtType(account.type) && account.balanceCents < 0) {
    return formatMoney(-account.balanceCents);
  }
  return formatMoney(account.balanceCents);
}

/* ---------- Forms ---------- */

/** $1 trillion either way: far past any real balance, and exact as a JS number. */
const LIMIT_CENTS = 100_000_000_000_000;

const signedMoney = (message: string) =>
  z.string().transform((value, ctx) => {
    const cents = parseSignedMoney(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    if (Math.abs(cents) > LIMIT_CENTS) {
      ctx.addIssue({ code: "custom", message: "That amount is too large" });
      return z.NEVER;
    }
    return cents;
  });

/** An optional money field: blank is null. */
const optionalMoney = (signed: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return null;
      const cents = signed ? parseSignedMoney(trimmed) : parseMoney(trimmed);
      if (cents === null || Math.abs(cents) > LIMIT_CENTS) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid amount, like 1250.00",
        });
        return z.NEVER;
      }
      return cents;
    });

const optionalDate = z
  .string()
  .optional()
  .transform((value) => value?.trim() || null)
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
      .nullable(),
  );

const optionalText = (max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(max, message).nullable());

export const accountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long"),
  type: z.enum(ACCOUNT_TYPES, { error: "Pick an account type" }),
  institution: optionalText(80, "Institution is too long"),
  lastFour: z
    .string()
    .optional()
    .transform((value) => value?.trim() || null)
    .pipe(
      z
        .string()
        .regex(/^\d{4}$/, "Enter the last four digits, like 1234")
        .nullable(),
    ),
  balance: signedMoney(
    "Enter the balance, like 1250.00, or -75.00 if overdrawn",
  ),
  creditLimit: optionalMoney(false),
  availableCredit: optionalMoney(true),
  statementBalance: optionalMoney(true),
  paymentDueDate: optionalDate,
  minimumPayment: optionalMoney(false),
  /** A checkbox: "on" makes this the chequing account expenses come off. */
  isPrimary: z
    .string()
    .optional()
    .transform((value) => value === "on" || value === "true"),
});

export type AccountFormValues = z.input<typeof accountSchema>;
export type AccountInput = z.output<typeof accountSchema>;

export const transferSchema = z
  .object({
    fromAccountId: z.uuid({ error: "Pick the account the money left" }),
    toAccountId: z.uuid({ error: "Pick the account it went to" }),
    amount: z.string().transform((value, ctx) => {
      const cents = parseMoney(value);
      if (cents === null || cents <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Enter an amount, like 250.00",
        });
        return z.NEVER;
      }
      return cents;
    }),
    transferredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    description: optionalText(120, "Description is too long"),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, {
    message: "Pick two different accounts",
    path: ["toAccountId"],
  });

export type TransferFormValues = z.input<typeof transferSchema>;
export type TransferInput = z.output<typeof transferSchema>;
