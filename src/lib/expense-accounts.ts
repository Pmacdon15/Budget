import { z } from "zod";
import {
  type Account,
  type AccountType,
  accountSubtitle,
} from "@/lib/accounts";

/*
 * Which account an expense came out of. With more than one account (say
 * chequing and a credit card), the app and the MCP server confirm the account
 * before saving, so a credit card charge is never taken off chequing. With one
 * account there's nothing to ask. Shared by browser and server.
 */

/** An account as the expense form offers it. */
export type ExpenseAccountOption = Pick<
  Account,
  "id" | "name" | "type" | "institution" | "lastFour" | "isPrimary"
>;

export const ACCOUNT_REQUIRED_MESSAGE = "Choose the account this came out of";

export const UNKNOWN_ACCOUNT_MESSAGE =
  "That account no longer exists. Choose another.";

/** "Visa (Credit card · RBC · ••1234)": how an account is named in a picker. */
export function expenseAccountLabel(
  account: Pick<Account, "name" | "type" | "institution" | "lastFour">,
) {
  const subtitle = accountSubtitle(account);
  return subtitle ? `${account.name} (${subtitle})` : account.name;
}

/** With more than one account, the user has to say which one paid. */
export const needsAccountChoice = (accounts: readonly unknown[]) =>
  accounts.length > 1;

/**
 * The `accountId` form field: empty means "not chosen" (null), anything else
 * must look like an account id. Whether it's required depends on how many
 * accounts the user has, which the server checks (see resolveExpenseAccount)
 * and the form checks with `requireAccount`.
 */
export const accountIdField = z
  .string()
  .optional()
  .transform((value) => value?.trim() || null)
  .pipe(z.uuid({ error: ACCOUNT_REQUIRED_MESSAGE }).nullable());

/** Adds "an account must be chosen" to a form schema, for a user with several accounts. */
export function requireAccount<T extends z.ZodType<{ accountId?: unknown }>>(
  schema: T,
) {
  return schema.superRefine((value, ctx) => {
    if (!value.accountId) {
      ctx.addIssue({
        code: "custom",
        message: ACCOUNT_REQUIRED_MESSAGE,
        path: ["accountId"],
      });
    }
  });
}

export type AccountChoice<T> =
  /** Use this account (null only when the user has no accounts at all). */
  | { kind: "ok"; accountId: string | null; account: T | null }
  /** Several accounts and none was named: ask the user which. */
  | { kind: "choose"; accounts: T[] }
  /** The account named isn't one of the user's. */
  | { kind: "unknown"; accounts: T[] };

/**
 * Which account an expense comes out of. A named account must be one of the
 * user's. With none named: no accounts at all is the old bank balance
 * behaviour (null), a single account is that one, and several means asking.
 */
export function resolveExpenseAccount<T extends { id: string }>(
  accounts: T[],
  requested: string | null | undefined,
): AccountChoice<T> {
  if (requested) {
    const account = accounts.find((a) => a.id === requested);
    return account
      ? { kind: "ok", accountId: account.id, account }
      : { kind: "unknown", accounts };
  }
  if (accounts.length === 0) {
    return { kind: "ok", accountId: null, account: null };
  }
  const [only] = accounts;
  if (accounts.length === 1 && only) {
    return { kind: "ok", accountId: only.id, account: only };
  }
  return { kind: "choose", accounts };
}

/** What `/api/expense-accounts` answers. */
export const expenseAccountsResponseSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string().transform((t) => t as AccountType),
      institution: z.string().nullable(),
      lastFour: z.string().nullable(),
      isPrimary: z.boolean(),
    }),
  ),
});

export const toExpenseAccountOption = (
  account: ExpenseAccountOption,
): ExpenseAccountOption => ({
  id: account.id,
  name: account.name,
  type: account.type,
  institution: account.institution,
  lastFour: account.lastFour,
  isPrimary: account.isPrimary,
});
