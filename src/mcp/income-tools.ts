import "server-only";
import { selectAccounts } from "@/db/accounts";
import { selectIncomeReceivedBetween } from "@/db/income";
import {
  insertPendingIncome,
  isDepositAccount,
  selectIncomeDuplicateMatch,
  selectIncomeReceiptSourceMatch,
  selectPendingIncomeList,
} from "@/db/pending-income";
import { today } from "@/lib/month";
import { toCents } from "@/lib/pending-expenses";
import {
  type AddIncomeInput,
  addIncomeInputSchema,
  incomeDuplicateMessage,
  listIncomeInputSchema,
} from "@/lib/pending-income";
import {
  friendly,
  preparedKind,
  prepareReceipt,
  receiptNote,
  storePreparedReceipt,
} from "@/mcp/receipts";
import type { McpCaller, ToolResult } from "@/mcp/tools";

/*
 * The MCP income tools: money coming in that an AI found in email (an
 * e-Transfer someone sent the user, a direct deposit, a client's payment).
 * Like add_expense, add_income only puts it on the Review page. Approving it
 * there makes it a take-home entry for its month, keeps the email as its
 * receipt, and adds it to the account it went into. `userId` comes only from
 * the verified caller.
 */

const REVIEW_URL = "https://budget.patmac.ca/review";

const dollars = (cents: number) => cents / 100;

function daysAgo(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function addIncome(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  return friendly(() => addIncomeFor(caller, args));
}

async function addIncomeFor(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input: AddIncomeInput = addIncomeInputSchema.parse(args);
  const amountCents = toCents(input.amount);
  // Checked before anything else, so a bad file never gets as far as storing.
  const prepared = input.receipt ? prepareReceipt(input.receipt) : null;

  if (
    input.account_id &&
    !(await isDepositAccount(caller.userId, input.account_id))
  ) {
    return {
      summary:
        "That isn't one of the user's chequing or savings accounts. Call list_accounts for the right id, or leave account_id out for the primary chequing account.",
      data: { account_id: input.account_id },
      isError: true,
    };
  }

  if (!input.allow_duplicate) {
    const match =
      (await selectIncomeDuplicateMatch(
        caller.userId,
        input.date,
        amountCents,
      )) ??
      (prepared
        ? await selectIncomeReceiptSourceMatch(caller.userId, prepared.source)
        : null);
    if (match) {
      return {
        summary: `${incomeDuplicateMessage(match)} Nothing was saved. Ask the user whether this is the same payment. Only if they say it's a separate one, call add_income again with allow_duplicate: true.`,
        data: {
          status: "possible_duplicate",
          match: {
            kind: match.kind,
            id: match.id,
            label: match.label,
            date: match.receivedOn,
            amount: dollars(match.amountCents),
          },
        },
      };
    }
  }

  const receipt = prepared
    ? await storePreparedReceipt(caller.userId, prepared)
    : null;
  const id = await insertPendingIncome(caller.userId, {
    receivedOn: input.date,
    label: input.label ?? input.payer,
    payer: input.payer,
    amountCents,
    accountId: input.account_id ?? null,
    source: input.source || null,
    client: caller.client,
    receipt,
  });
  const into = input.account_id ? "the account you named" : "primary chequing";
  return {
    summary: `Sent to Pending Review: ${input.payer}, $${input.amount.toFixed(2)} received on ${input.date}. The user approves it in Budget at ${REVIEW_URL}; it then counts as take-home for ${input.date.slice(0, 7)} and goes into ${into}.${prepared ? ` ${receiptNote(prepared)}` : ""}`,
    data: {
      status: "pending_review",
      id,
      review_url: REVIEW_URL,
      account_id: input.account_id ?? null,
      has_receipt: receipt !== null,
      receipt_kind: prepared ? preparedKind(prepared) : null,
    },
  };
}

export async function listIncome(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = listIncomeInputSchema.parse(args ?? {});
  const to = input.to ?? today();
  const from = input.from ?? daysAgo(to, 31);
  if (from > to) {
    return {
      summary: "`from` must be on or before `to`.",
      data: { from, to },
      isError: true,
    };
  }
  const [saved, pending, accounts] = await Promise.all([
    selectIncomeReceivedBetween(caller.userId, from, to),
    selectPendingIncomeList(caller.userId),
    selectAccounts(caller.userId),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const waiting = pending.filter(
    (p) => p.receivedOn >= from && p.receivedOn <= to,
  );
  return {
    summary: `${saved.length} take-home entr${saved.length === 1 ? "y" : "ies"} and ${waiting.length} waiting for review between ${from} and ${to}.`,
    data: {
      from,
      to,
      income: saved.map((i) => ({
        id: i.id,
        date: i.receivedOn,
        month: i.month,
        label: i.label,
        payer: i.payer ?? null,
        amount: dollars(i.amountCents),
        account: i.accountId ? (accountName.get(i.accountId) ?? null) : null,
        has_receipt: Boolean(i.receiptId),
        ...(i.receiptId ? { receipt_kind: i.receiptKind ?? "details" } : {}),
      })),
      pending_review: waiting.map((p) => ({
        id: p.id,
        date: p.receivedOn,
        label: p.label,
        payer: p.payer,
        amount: dollars(p.amountCents),
        account: p.accountName,
        has_receipt: p.hasReceipt,
        ...(p.hasReceipt ? { receipt_kind: p.receiptKind ?? "details" } : {}),
      })),
    },
  };
}
