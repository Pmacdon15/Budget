import "server-only";
import { buildMonthOverview } from "@/dal/overview";
import {
  applyStatementDetails,
  type BalanceAsOf,
  insertPendingAccount,
  insertStatement,
  insertTransfer,
  selectAccount,
  selectAccounts,
  selectDuplicateTransfer,
  selectPendingAccounts,
  selectStatementFor,
  setAccountBalanceIfNewer,
  setStatementPdf,
} from "@/db/accounts";
import {
  listAccountsInputSchema,
  proposeAccountInputSchema,
  recordStatementInputSchema,
  recordTransferInputSchema,
  updateAccountBalanceInputSchema,
} from "@/lib/account-tools";
import {
  type Account,
  type AccountType,
  institutionsMatch,
  isDebtType,
  matchAccount,
  netChequingCents,
  type PendingAccount,
  proposedAccountName,
  totalOwedCents,
} from "@/lib/accounts";
import { currentMonth, today } from "@/lib/month";
import { toCents } from "@/lib/pending-expenses";
import {
  isPdf,
  MAX_PDF_BYTES,
  newStatementPdfPathname,
} from "@/lib/statement-pdf";
import { deleteStatementPdf, putStatementPdf } from "@/lib/statement-store";
import type { McpCaller, ToolResult } from "@/mcp/tools";

/*
 * The MCP tools for accounts: listing them, proposing a new one (it waits on
 * the Review page), updating a balance, recording a statement (with its PDF)
 * and recording a transfer. Like every tool, they act only for the verified
 * caller; `userId` never comes from arguments.
 */

const REVIEW_URL = "https://budget.patmac.ca/review";

const dollars = (cents: number) => cents / 100;
const dollarsOrNull = (cents: number | null) =>
  cents == null ? null : cents / 100;
const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const centsOrNull = (amount: number | undefined) =>
  amount === undefined ? null : toCents(amount);

/** Input a schema can't catch (a bad PDF, a future date), as a readable tool error. */
class ToolInputError extends Error {}

async function friendly(tool: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await tool();
  } catch (error) {
    if (error instanceof ToolInputError) {
      return { summary: error.message, data: {}, isError: true };
    }
    throw error;
  }
}

/**
 * When a reported balance was true. A date of today is now; an earlier date
 * means the end of that day (everything dated that day is already in it); a
 * time is taken as given. Nothing in the future.
 */
export function balanceAsOf(value: string | undefined, now = new Date()) {
  if (!value) return { kind: "now" } as const satisfies BalanceAsOf;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = today(now);
    if (value > day) {
      throw new ToolInputError("The as-of date can't be in the future.");
    }
    return value === day
      ? ({ kind: "now" } as const satisfies BalanceAsOf)
      : ({ kind: "dayAfter", date: value } as const satisfies BalanceAsOf);
  }
  const at = new Date(value);
  if (at.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new ToolInputError("The as-of time can't be in the future.");
  }
  return {
    kind: "instant",
    at: at.toISOString(),
  } as const satisfies BalanceAsOf;
}

/** Decodes and checks a statement PDF. Nothing is stored yet. */
function decodePdf(base64: string | undefined): Uint8Array | null {
  if (!base64) return null;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (!isPdf(bytes)) {
    throw new ToolInputError(
      "The attachment isn't a PDF. Send the statement PDF, base64-encoded, or leave pdf_base64 out.",
    );
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new ToolInputError("The PDF is larger than 3MB.");
  }
  return bytes;
}

async function storePdf(userId: string, bytes: Uint8Array) {
  const pathname = newStatementPdfPathname(userId);
  await putStatementPdf(
    pathname,
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
  );
  return pathname;
}

export const accountData = (a: Account) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  institution: a.institution,
  last_four: a.lastFour,
  balance: dollars(a.balanceCents),
  balance_means: isDebtType(a.type) ? "owed" : "in the account",
  balance_as_of: a.balanceAsOf,
  balance_source: a.balanceSource,
  expenses_come_off_this: a.isPrimary,
  counts_toward_leftover_spend: a.type === "chequing",
  credit_limit: dollarsOrNull(a.creditLimitCents),
  available_credit: dollarsOrNull(a.availableCreditCents),
  statement_balance: dollarsOrNull(a.statementBalanceCents),
  statement_closing_date: a.statementClosingDate,
  payment_due_date: a.paymentDueDate,
  minimum_payment: dollarsOrNull(a.minimumPaymentCents),
});

const pendingData = (p: PendingAccount) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  institution: p.institution,
  last_four: p.lastFour,
  balance: dollarsOrNull(p.balanceCents),
  statement_closing_date: p.statementClosingDate,
  has_statement_pdf: p.hasStatementPdf,
});

const brief = (a: Account) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  institution: a.institution,
  last_four: a.lastFour,
});

/** A proposal already waiting for the same institution and last four. */
function findPending(
  pending: PendingAccount[],
  query: { institution: string; lastFour: string; type?: AccountType },
) {
  return pending.find(
    (p) =>
      p.lastFour === query.lastFour &&
      institutionsMatch(p.institution, query.institution) &&
      (!query.type || p.type === query.type),
  );
}

/* ---------- list_accounts ---------- */

export async function listAccounts(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  listAccountsInputSchema.parse(args ?? {});
  const month = currentMonth();
  const [accounts, pending, overview] = await Promise.all([
    selectAccounts(caller.userId),
    selectPendingAccounts(caller.userId),
    buildMonthOverview(caller.userId, month, 1),
  ]);
  const net = netChequingCents(accounts);
  const { leftover } = overview;
  return {
    summary: `${accounts.length} account(s)${pending.length ? `, ${pending.length} proposed and waiting for review` : ""}. ${
      net === null ? "No chequing accounts." : `Net chequing ${money(net)}.`
    } Leftover spend this month: ${money(leftover.leftoverCents)}${
      leftover.limitedBy === "overdrawn"
        ? " (chequing is below zero, so nothing is left to spend)"
        : leftover.limitedBy === "chequing"
          ? " (held to what's in chequing)"
          : ""
    }. Credit cards and lines of credit don't count toward it.`,
    data: {
      accounts: accounts.map(accountData),
      pending_review: pending.map(pendingData),
      net_chequing: net === null ? null : dollars(net),
      owed_on_credit: dollars(totalOwedCents(accounts)),
      leftover_spend: {
        month,
        amount: dollars(leftover.leftoverCents),
        budget_left: dollars(leftover.budgetLeftCents),
        limited_by: leftover.limitedBy,
      },
    },
  };
}

/* ---------- propose_account ---------- */

export function proposeAccount(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  return friendly(async () => {
    const input = proposeAccountInputSchema.parse(args);
    const query = {
      institution: input.institution,
      lastFour: input.last_four,
      type: input.type,
    };
    const accounts = await selectAccounts(caller.userId);
    const match = matchAccount(accounts, query);
    if (match.kind !== "none") {
      const found = match.kind === "match" ? [match.account] : match.accounts;
      return {
        summary: `Nothing was saved: the user already has ${found.map((a) => `"${a.name}"`).join(" and ")} at ${input.institution} ending in ${input.last_four}. Use that account (update_account_balance or record_statement with its id).`,
        data: { status: "already_exists", accounts: found.map(brief) },
      };
    }
    const waiting = findPending(
      await selectPendingAccounts(caller.userId),
      query,
    );
    if (waiting) {
      return {
        summary: `Nothing was saved: "${waiting.name}" is already waiting for the user's review at ${REVIEW_URL}.`,
        data: { status: "already_pending", id: waiting.id },
      };
    }
    const asOf = input.balance === undefined ? null : balanceAsOf(input.as_of);
    const name =
      input.name ??
      proposedAccountName(input.institution, input.type, input.last_four);
    const debt = isDebtType(input.type);
    const id = await insertPendingAccount(caller.userId, {
      type: input.type,
      name,
      institution: input.institution,
      lastFour: input.last_four,
      balanceCents: centsOrNull(input.balance),
      balanceAsOf: asOf,
      balanceSource: input.balance === undefined ? null : input.source || "ai",
      creditLimitCents: debt ? centsOrNull(input.credit_limit) : null,
      availableCreditCents: debt ? centsOrNull(input.available_credit) : null,
      statementBalanceCents: null,
      statementClosingDate: null,
      paymentDueDate: debt ? (input.payment_due_date ?? null) : null,
      minimumPaymentCents: debt ? centsOrNull(input.minimum_payment) : null,
      statementPdfPathname: null,
      source: input.source || null,
      client: caller.client,
    });
    return {
      summary: `Proposed a new account, "${name}". It's on the user's Pending Review list at ${REVIEW_URL}; nothing is created until they approve it. Tell them so.`,
      data: { status: "pending_review", id, name, review_url: REVIEW_URL },
    };
  });
}

/* ---------- update_account_balance ---------- */

type Resolved =
  | { kind: "account"; account: Account }
  | { kind: "error"; result: ToolResult };

/** The account an id or institution plus last four names, or a tool error saying what to do. */
async function resolveAccount(
  userId: string,
  ref: { account_id?: string; institution?: string; last_four?: string },
  type?: AccountType,
): Promise<Resolved | { kind: "none"; similar: Account[] }> {
  if (ref.account_id) {
    const account = await selectAccount(userId, ref.account_id);
    if (account) return { kind: "account", account };
    return {
      kind: "error",
      result: {
        summary: "No account with that id. Call list_accounts to find it.",
        data: {},
        isError: true,
      },
    };
  }
  const match = matchAccount(await selectAccounts(userId), {
    institution: String(ref.institution),
    lastFour: String(ref.last_four),
    type,
  });
  if (match.kind === "match")
    return { kind: "account", account: match.account };
  if (match.kind === "ambiguous") {
    return {
      kind: "error",
      result: {
        summary: `More than one account matches ${ref.institution} ending in ${ref.last_four}: ${match.accounts.map((a) => `"${a.name}"`).join(", ")}. Ask the user which one, then pass its account_id. Nothing was changed.`,
        data: { status: "ambiguous", accounts: match.accounts.map(brief) },
        isError: true,
      },
    };
  }
  return { kind: "none", similar: match.similar };
}

export function updateAccountBalance(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  return friendly(async () => {
    const input = updateAccountBalanceInputSchema.parse(args);
    const asOf = balanceAsOf(input.as_of);
    const resolved = await resolveAccount(caller.userId, input);
    if (resolved.kind === "error") return resolved.result;
    if (resolved.kind === "none") {
      return {
        summary: `No account at ${input.institution} ends in ${input.last_four}, so nothing was changed. Ask the user whether to add it, then call propose_account (it goes to Pending Review).${resolved.similar.length ? ` Accounts ending in ${input.last_four} at another institution: ${resolved.similar.map((a) => `"${a.name}"`).join(", ")}. Ask whether it's one of these.` : ""}`,
        data: { status: "no_match", similar: resolved.similar.map(brief) },
        isError: true,
      };
    }
    const { account } = resolved;
    const balanceCents = toCents(input.balance);
    const saved = await setAccountBalanceIfNewer(
      caller.userId,
      account.id,
      balanceCents,
      asOf,
      input.source || "ai",
    );
    if (saved === "missing") {
      return {
        summary: "No account with that id. Call list_accounts to find it.",
        data: {},
        isError: true,
      };
    }
    const now = (await selectAccount(caller.userId, account.id)) ?? account;
    if (saved === "older") {
      return {
        summary: `Kept ${account.name}'s newer balance (as of ${account.balanceAsOf}): this one is older, so nothing was changed.`,
        data: { status: "kept_newer", account: accountData(now) },
      };
    }
    return {
      summary:
        `${account.name} set to ${money(balanceCents)}${isDebtType(account.type) ? " owed" : ""}. ${account.isPrimary ? "Expenses dated from then on, added after it, come off it." : ""}`.trim(),
      data: { status: "updated", account: accountData(now) },
    };
  });
}

/* ---------- record_statement ---------- */

export function recordStatement(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  return friendly(async () => {
    const input = recordStatementInputSchema.parse(args);
    if (input.closing_date > today()) {
      throw new ToolInputError("The closing date can't be in the future.");
    }
    const pdf = decodePdf(input.pdf_base64);
    const balanceCents = toCents(input.balance);
    const resolved = await resolveAccount(
      caller.userId,
      {
        account_id: input.account_id,
        institution: input.institution,
        last_four: input.last_four,
      },
      input.account_type,
    );
    if (resolved.kind === "error") return resolved.result;

    if (resolved.kind === "none") {
      return proposeFromStatement(caller, input, pdf, resolved.similar);
    }

    const { account } = resolved;
    const debt = isDebtType(account.type);
    const existing = await selectStatementFor(
      caller.userId,
      account.id,
      input.closing_date,
    );
    if (existing) {
      if (pdf && !existing.hasPdf) {
        const pathname = await storePdf(caller.userId, pdf);
        if (await setStatementPdf(caller.userId, existing.id, pathname)) {
          return {
            summary: `That statement was already recorded; its PDF is now attached, so the user can download it in Budget. Nothing else changed.`,
            data: {
              status: "pdf_attached",
              statement_id: existing.id,
              account: brief(account),
            },
          };
        }
        await deleteStatementPdf(pathname);
      }
      return {
        summary: `The ${input.closing_date} statement for ${account.name} is already recorded, so nothing changed.`,
        data: {
          status: "already_recorded",
          statement_id: existing.id,
          account: brief(account),
        },
      };
    }

    const pathname = pdf ? await storePdf(caller.userId, pdf) : null;
    const values = {
      accountId: account.id,
      closingDate: input.closing_date,
      balanceCents,
      minimumPaymentCents: debt ? centsOrNull(input.minimum_payment) : null,
      paymentDueDate: debt ? (input.payment_due_date ?? null) : null,
      creditLimitCents: debt ? centsOrNull(input.credit_limit) : null,
      availableCreditCents: debt ? centsOrNull(input.available_credit) : null,
      pdfPathname: pathname,
      source: input.source || null,
      client: caller.client,
    };
    const statementId = await insertStatement(caller.userId, values);
    if (!statementId) {
      // Recorded by another call in the meantime: the same statement twice.
      if (pathname) await deleteStatementPdf(pathname);
      return {
        summary: `The ${input.closing_date} statement for ${account.name} is already recorded, so nothing changed.`,
        data: { status: "already_recorded", account: brief(account) },
      };
    }
    await applyStatementDetails(caller.userId, values);
    const balance = await setAccountBalanceIfNewer(
      caller.userId,
      account.id,
      balanceCents,
      { kind: "dayAfter", date: input.closing_date },
      "statement",
    );
    const now = (await selectAccount(caller.userId, account.id)) ?? account;
    return {
      summary: `Recorded the ${input.closing_date} statement for ${account.name} (${money(balanceCents)}${debt ? " owed" : ""}).${
        balance === "updated"
          ? " Its balance is now the statement's, as of the closing date; anything dated after it that's recorded comes off it."
          : ` The account already has a newer balance (as of ${account.balanceAsOf}), so that was kept.`
      }${pathname ? " The PDF is saved, so the user can download it in Budget." : ""}`,
      data: {
        status: "recorded",
        statement_id: statementId,
        balance_updated: balance === "updated",
        has_pdf: pathname !== null,
        account: accountData(now),
      },
    };
  });
}

/** No account matches: propose one, with the statement, for the user to approve. */
async function proposeFromStatement(
  caller: McpCaller,
  input: ReturnType<typeof recordStatementInputSchema.parse>,
  pdf: Uint8Array | null,
  similar: Account[],
): Promise<ToolResult> {
  const pending = await selectPendingAccounts(caller.userId);
  const waiting = findPending(pending, {
    institution: input.institution,
    lastFour: input.last_four,
    type: input.account_type,
  });
  if (waiting) {
    return {
      summary: `"${waiting.name}" is already waiting for the user's review at ${REVIEW_URL}, so nothing changed. Once they approve it, record later statements against it.`,
      data: { status: "already_pending", id: waiting.id },
    };
  }
  if (!input.account_type) {
    return {
      summary: `No account at ${input.institution} ends in ${input.last_four}. To propose one, call record_statement again with account_type (chequing, credit_card or line_of_credit); ask the user if the statement doesn't make it clear. Nothing was saved.`,
      data: { status: "needs_account_type", similar: similar.map(brief) },
      isError: true,
    };
  }
  const type = input.account_type;
  const debt = isDebtType(type);
  const pathname = pdf ? await storePdf(caller.userId, pdf) : null;
  const name = proposedAccountName(input.institution, type, input.last_four);
  const id = await insertPendingAccount(caller.userId, {
    type,
    name,
    institution: input.institution,
    lastFour: input.last_four,
    balanceCents: toCents(input.balance),
    balanceAsOf: { kind: "dayAfter", date: input.closing_date },
    balanceSource: "statement",
    creditLimitCents: debt ? centsOrNull(input.credit_limit) : null,
    availableCreditCents: debt ? centsOrNull(input.available_credit) : null,
    statementBalanceCents: toCents(input.balance),
    statementClosingDate: input.closing_date,
    paymentDueDate: debt ? (input.payment_due_date ?? null) : null,
    minimumPaymentCents: debt ? centsOrNull(input.minimum_payment) : null,
    statementPdfPathname: pathname,
    source: input.source || null,
    client: caller.client,
  });
  return {
    summary: `No account matches ${input.institution} ending in ${input.last_four}, so a new account, "${name}", with this statement is on the user's Pending Review list at ${REVIEW_URL}. Nothing is created until they approve it. Tell them so.${similar.length ? ` Accounts ending in ${input.last_four} at another institution: ${similar.map((a) => `"${a.name}"`).join(", ")}. Ask the user whether it's one of these instead.` : ""}`,
    data: {
      status: "pending_review",
      id,
      name,
      review_url: REVIEW_URL,
      has_pdf: pathname !== null,
      similar: similar.map(brief),
    },
  };
}

/* ---------- record_transfer ---------- */

export async function recordTransfer(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = recordTransferInputSchema.parse(args);
  const [from, to] = await Promise.all([
    selectAccount(caller.userId, input.from_account_id),
    selectAccount(caller.userId, input.to_account_id),
  ]);
  if (!from || !to) {
    return {
      summary: `No account with ${!from ? "from_account_id" : "to_account_id"}. Call list_accounts to find it.`,
      data: {},
      isError: true,
    };
  }
  const amountCents = toCents(input.amount);
  const values = {
    fromAccountId: from.id,
    toAccountId: to.id,
    amountCents,
    transferredOn: input.date,
  };
  if (!input.allow_duplicate) {
    const duplicate = await selectDuplicateTransfer(caller.userId, values);
    if (duplicate) {
      return {
        summary: `Nothing was saved: ${money(amountCents)} from ${from.name} to ${to.name} on ${input.date} is already recorded. Only if the user says it's a separate transfer, call record_transfer again with allow_duplicate: true.`,
        data: { status: "possible_duplicate", id: duplicate.id },
      };
    }
  }
  const id = await insertTransfer(caller.userId, {
    ...values,
    description: input.description || null,
    source: input.source || null,
    client: caller.client,
  });
  if (!id) {
    return {
      summary: "Those accounts aren't the user's. Call list_accounts.",
      data: {},
      isError: true,
    };
  }
  return {
    summary: `Recorded ${money(amountCents)} moved from ${from.name} to ${to.name} on ${input.date}. It's a transfer, not an expense: don't also add_expense it.`,
    data: {
      status: "recorded",
      id,
      from: brief(from),
      to: brief(to),
      amount: dollars(amountCents),
      date: input.date,
      counts_as_spending: false,
    },
  };
}
