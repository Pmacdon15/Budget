import "server-only";
import { selectBankBalance, upsertBankBalance } from "@/db/bank-balance";
import {
  deleteExpenseRow,
  selectExpenseById,
  selectExpensesBetween,
  updateExpenseRow,
} from "@/db/expenses";
import {
  insertPendingExpense,
  selectDuplicateMatch,
  selectPendingExpenses,
} from "@/db/pending-expenses";
import { CATEGORIES } from "@/lib/categories";
import { monthOfDate, today } from "@/lib/month";
import {
  type AddExpenseInput,
  addExpenseInputSchema,
  deleteExpenseInputSchema,
  duplicateMessage,
  editExpenseInputSchema,
  listExpensesInputSchema,
  syncBankBalanceInputSchema,
  toCents,
} from "@/lib/pending-expenses";
import { deleteReceiptImage } from "@/lib/receipt-store";

/*
 * What each MCP tool does, as plain functions of the verified caller. The
 * route (src/app/api/mcp/route.ts) has already checked the OAuth token or API
 * key; `userId` comes only from that check, never from tool arguments, so a
 * tool can only ever read or change that user's data.
 */

export type McpCaller = {
  userId: string;
  /** Which AI app is calling, for the Review page. */
  client: string | null;
};

/** A tool's answer: a sentence for the AI, plus the same thing as data. */
export type ToolResult = {
  summary: string;
  data: Record<string, unknown>;
  isError?: boolean;
};

const REVIEW_URL = "https://budget.patmac.ca/review";

const dollars = (cents: number) => cents / 100;

function daysAgo(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function listCategories(): ToolResult {
  return {
    summary: `${CATEGORIES.length} categories. Use the name, not the label.`,
    data: {
      categories: CATEGORIES.map((c) => ({
        name: c.name,
        label: c.label,
        examples: c.hint,
      })),
    },
  };
}

export async function listExpenses(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = listExpensesInputSchema.parse(args ?? {});
  const to = input.to ?? today();
  const from = input.from ?? daysAgo(to, 31);
  if (from > to) {
    return {
      summary: "`from` must be on or before `to`.",
      data: { from, to },
      isError: true,
    };
  }
  const saved = (
    await selectExpensesBetween(
      caller.userId,
      monthOfDate(from),
      monthOfDate(to),
    )
  ).filter((e) => e.spentOn >= from && e.spentOn <= to);
  const pending = (await selectPendingExpenses(caller.userId)).filter(
    (p) => p.spentOn >= from && p.spentOn <= to,
  );
  return {
    summary: `${saved.length} saved expense(s) and ${pending.length} waiting for review between ${from} and ${to}.`,
    data: {
      from,
      to,
      expenses: saved.map((e) => ({
        id: e.id,
        date: e.spentOn,
        description: e.description,
        category: e.category,
        amount: dollars(e.amountCents),
      })),
      pending_review: pending.map((p) => ({
        id: p.id,
        date: p.spentOn,
        description: p.description,
        merchant: p.merchant,
        category: p.category,
        amount: dollars(p.amountCents),
      })),
    },
  };
}

export async function addExpense(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input: AddExpenseInput = addExpenseInputSchema.parse(args);
  const amountCents = toCents(input.amount);

  if (!input.allow_duplicate) {
    const match = await selectDuplicateMatch(
      caller.userId,
      input.date,
      amountCents,
    );
    if (match) {
      return {
        summary: `${duplicateMessage(match)} Nothing was saved. Ask the user whether this is the same purchase. Only if they say it's a separate charge, call add_expense again with allow_duplicate: true.`,
        data: {
          status: "possible_duplicate",
          match: {
            kind: match.kind,
            id: match.id,
            description: match.description,
            date: match.spentOn,
            amount: dollars(match.amountCents),
          },
        },
      };
    }
  }

  const id = await insertPendingExpense(caller.userId, {
    spentOn: input.date,
    description: input.description ?? input.merchant,
    merchant: input.merchant,
    category: input.category,
    amountCents,
    source: input.source || null,
    client: caller.client,
  });
  return {
    summary: `Sent to Pending Review: ${input.merchant}, $${input.amount.toFixed(2)} on ${input.date} (${input.category}). The user approves it in Budget at ${REVIEW_URL} before it counts as an expense.`,
    data: { status: "pending_review", id, review_url: REVIEW_URL },
  };
}

export async function syncBankBalance(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = syncBankBalanceInputSchema.parse(args);
  const balanceCents = toCents(input.balance);
  await upsertBankBalance(caller.userId, balanceCents);
  const saved = await selectBankBalance(caller.userId);
  return {
    summary: `Bank balance set to $${input.balance.toFixed(2)}. Expenses added from now on come off it; earlier ones are already in this number.`,
    data: {
      balance: dollars(saved?.balanceCents ?? balanceCents),
      updated_at: saved?.updatedAt ?? null,
    },
  };
}

export async function editExpense(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = editExpenseInputSchema.parse(args);
  const existing = await selectExpenseById(caller.userId, input.id);
  if (!existing) {
    return {
      summary: "No expense with that id. Call list_expenses to find it.",
      data: { id: input.id },
      isError: true,
    };
  }
  const spentOn = input.date ?? existing.spentOn;
  const values = {
    month: monthOfDate(spentOn),
    spentOn,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    amountCents:
      input.amount === undefined ? existing.amountCents : toCents(input.amount),
  };
  await updateExpenseRow(caller.userId, input.id, values);
  return {
    summary: `Updated: ${values.description}, $${(values.amountCents / 100).toFixed(2)} on ${values.spentOn} (${values.category}).`,
    data: {
      id: input.id,
      date: values.spentOn,
      description: values.description,
      category: values.category,
      amount: dollars(values.amountCents),
    },
  };
}

export async function deleteExpense(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = deleteExpenseInputSchema.parse(args);
  const existing = await selectExpenseById(caller.userId, input.id);
  const deleted = existing
    ? await deleteExpenseRow(caller.userId, input.id)
    : null;
  if (!existing || !deleted) {
    return {
      summary: "No expense with that id. Call list_expenses to find it.",
      data: { id: input.id },
      isError: true,
    };
  }
  if (deleted.imagePathname) await deleteReceiptImage(deleted.imagePathname);
  return {
    summary: `Deleted: ${existing.description}, $${(existing.amountCents / 100).toFixed(2)} on ${existing.spentOn}.`,
    data: { id: input.id, deleted: true },
  };
}
