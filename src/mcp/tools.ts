import "server-only";
import { updateFixedItemFor } from "@/dal/fixed-items";
import { selectBankBalance, upsertBankBalance } from "@/db/bank-balance";
import {
  insertBillPayment,
  linkExpenseToBillRow,
  selectPaidBillIds,
  unlinkExpenseFromBillRow,
} from "@/db/bill-payments";
import {
  deleteExpenseRow,
  markExpensePaidRow,
  selectExpenseById,
  selectExpensesWithStatus,
  updateExpenseRow,
} from "@/db/expenses";
import {
  insertFixedItem,
  selectFixedItem,
  selectFixedItemHistory,
  selectFixedItemInMonth,
  selectFixedItems,
  selectLastCharges,
} from "@/db/fixed-items";
import {
  insertPendingExpense,
  markPendingPaid,
  selectDuplicateMatch,
  selectPendingExpense,
  selectPendingExpenses,
  setPendingBill,
} from "@/db/pending-expenses";
import { selectReceiptSourceMatch } from "@/db/receipt-files";
import {
  type BillMatch,
  cleanKeywords,
  DEFAULT_AMOUNT_TOLERANCE,
  matchBills,
} from "@/lib/bill-matching";
import { isActive } from "@/lib/budget";
import { CATEGORIES, isCategory } from "@/lib/categories";
import { currentMonth, monthOfDate, today } from "@/lib/month";
import {
  type AddExpenseInput,
  addExpenseInputSchema,
  addFixedBillInputSchema,
  convertExpenseToFixedBillInputSchema,
  deleteExpenseInputSchema,
  duplicateMessage,
  editExpenseInputSchema,
  editFixedBillInputSchema,
  findMatchingFixedBillInputSchema,
  listExpensesInputSchema,
  listFixedBillsInputSchema,
  markBillPaidInputSchema,
  markExpensePaidInputSchema,
  syncBankBalanceInputSchema,
  toCents,
  unlinkFixedBillInputSchema,
} from "@/lib/pending-expenses";
import { receiptKindLabel } from "@/lib/receipt-files";
import type { FixedItem } from "@/lib/types";
import {
  attachReceiptFor,
  discardReceiptFiles,
  friendly,
  preparedKind,
  prepareReceipt,
  storePreparedReceipt,
} from "@/mcp/receipts";

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

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const notFound = (what: string, lookup: string): ToolResult => ({
  summary: `No ${what} with that id. Call ${lookup} to find it.`,
  data: {},
  isError: true,
});

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
  const saved = await selectExpensesWithStatus(caller.userId, from, to);
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
        unpaid: e.unpaid,
        has_receipt: e.hasReceipt,
        ...(e.hasReceipt ? { receipt_kind: e.receiptKind ?? "details" } : {}),
        fixed_bill_id: e.fixedItemId ?? null,
      })),
      pending_review: pending.map((p) => ({
        id: p.id,
        date: p.spentOn,
        description: p.description,
        merchant: p.merchant,
        category: p.category,
        amount: dollars(p.amountCents),
        unpaid: p.unpaid,
        has_receipt: p.hasReceipt,
        ...(p.hasReceipt ? { receipt_kind: p.receiptKind ?? "details" } : {}),
        fixed_bill_id: p.fixedItemId ?? null,
        is_subscription: p.isSubscription ?? "unknown",
      })),
    },
  };
}

export function addExpense(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  return friendly(() => addExpenseFor(caller, args));
}

async function addExpenseFor(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input: AddExpenseInput = addExpenseInputSchema.parse(args);
  const amountCents = toCents(input.amount);
  // Checked before anything else, so a bad file never gets as far as storing.
  const prepared = input.receipt ? prepareReceipt(input.receipt) : null;

  if (!input.allow_duplicate) {
    const match =
      (await selectDuplicateMatch(caller.userId, input.date, amountCents)) ??
      (prepared
        ? await selectReceiptSourceMatch(caller.userId, prepared.source)
        : null);
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

  const month = monthOfDate(input.date);
  let fixedItemId: string | null = null;
  if (input.fixed_bill_id) {
    const bill = await selectFixedItemInMonth(
      caller.userId,
      input.fixed_bill_id,
      month,
    );
    if (!bill) {
      return {
        summary: `That fixed bill isn't active in ${month}. Call list_fixed_bills for that month.`,
        data: { fixed_bill_id: input.fixed_bill_id },
        isError: true,
      };
    }
    fixedItemId = bill.id;
  } else if (input.is_subscription !== false) {
    const matches = matchBills(await activeBills(caller.userId, month), {
      merchant: input.merchant,
      description: input.description,
      amountCents,
      date: input.date,
    });
    if (matches.length > 0) {
      return {
        summary: `Nothing was saved: this may be a fixed bill the user already has. ${matches[0]?.suggestion} Ask the user. If it is that bill, call add_expense again with fixed_bill_id (and, if the amount changed, edit_fixed_bill first, or let them choose Replace on the Review page). If it's a separate charge, call add_expense again with is_subscription: false.`,
        data: { status: "matches_fixed_bill", matches: matches.map(matchData) },
      };
    }
  }

  const receipt = prepared
    ? await storePreparedReceipt(caller.userId, prepared)
    : null;
  const id = await insertPendingExpense(caller.userId, {
    spentOn: input.date,
    description: input.description ?? input.merchant,
    merchant: input.merchant,
    category: input.category,
    amountCents,
    source: input.source || null,
    client: caller.client,
    unpaid: input.unpaid ?? false,
    receipt,
    fixedItemId,
    isSubscription:
      input.is_subscription === undefined || input.is_subscription === "unknown"
        ? null
        : input.is_subscription,
  });
  const notes = [
    fixedItemId
      ? "It pays a fixed bill: approving marks that month paid, so it isn't counted twice. If the amount differs, the user can choose Replace on the Review page to update the bill."
      : input.is_subscription === true
        ? "Marked as a subscription: approving it adds it as a fixed bill."
        : null,
    input.unpaid
      ? "Marked not paid yet: it stays off the bank balance until mark_expense_paid."
      : null,
    prepared
      ? `Receipt attached (${receiptKindLabel(preparedKind(prepared))}).`
      : null,
  ].filter(Boolean);
  return {
    summary: `Sent to Pending Review: ${input.merchant}, $${input.amount.toFixed(2)} on ${input.date} (${input.category}). The user approves it in Budget at ${REVIEW_URL} before it counts as an expense.${notes.length ? ` ${notes.join(" ")}` : ""}`,
    data: {
      status: "pending_review",
      id,
      review_url: REVIEW_URL,
      unpaid: input.unpaid ?? false,
      has_receipt: receipt !== null,
      receipt_kind: prepared ? preparedKind(prepared) : null,
      fixed_bill_id: fixedItemId,
    },
  };
}

export async function syncBankBalance(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = syncBankBalanceInputSchema.parse(args);
  const balanceCents = toCents(input.balance);
  await upsertBankBalance(caller.userId, balanceCents, input.source || "alert");
  const saved = await selectBankBalance(caller.userId);
  return {
    summary: `Bank balance (${saved?.accountName ?? "Chequing"}, the account expenses come off) set to $${input.balance.toFixed(2)}. Expenses dated today or later, added from now on, come off it; anything dated earlier is already in this number. When the email names another account, use update_account_balance instead.`,
    data: {
      account_id: saved?.accountId ?? null,
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
  await discardReceiptFiles([deleted.imagePathname, deleted.filePathname]);
  return {
    summary: `Deleted: ${existing.description}, $${(existing.amountCents / 100).toFixed(2)} on ${existing.spentOn}.`,
    data: { id: input.id, deleted: true },
  };
}

export async function markExpensePaid(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = markExpensePaidInputSchema.parse(args);
  const saved = await markExpensePaidRow(
    caller.userId,
    input.id,
    input.paid_on,
  );
  if (saved === "paid") {
    return {
      summary: `Marked paid on ${input.paid_on}. It now comes off the bank balance if it was paid after the balance was last set.`,
      data: { id: input.id, kind: "expense", paid_on: input.paid_on },
    };
  }
  if (saved === "already") {
    return {
      summary: "That expense wasn't marked unpaid, so nothing changed.",
      data: { id: input.id, kind: "expense" },
    };
  }
  if (await markPendingPaid(caller.userId, input.id, input.paid_on)) {
    return {
      summary: `Marked paid on ${input.paid_on}. It's still waiting for the user's review.`,
      data: { id: input.id, kind: "pending", paid_on: input.paid_on },
    };
  }
  return notFound("expense or pending item", "list_expenses");
}

export function attachReceipt(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  return friendly(() => attachReceiptFor(caller, args));
}

const billData = (bill: FixedItem, paid?: boolean) => ({
  id: bill.id,
  name: bill.name,
  category: bill.category,
  amount: dollars(bill.amountCents),
  is_estimate: bill.isEstimate ?? false,
  frequency: "monthly",
  due_day: bill.dueDay,
  merchant: bill.merchant ?? null,
  match_keywords: bill.matchKeywords ?? [],
  start_month: bill.startMonth,
  end_month: bill.endMonth,
  ...(paid === undefined ? {} : { paid_this_month: paid }),
});

/** The user's bills active in `month`. */
async function activeBills(userId: string, month: string) {
  return (await selectFixedItems(userId)).filter((b) => isActive(b, month));
}

const matchData = (m: BillMatch) => ({
  fixed_bill_id: m.bill.id,
  name: m.bill.name,
  bill_amount: dollars(m.bill.amountCents),
  is_estimate: m.bill.isEstimate ?? false,
  match: m.kind,
  score: m.score,
  amount_difference: dollars(m.differenceCents),
  looks_like_usage: m.looksLikeUsage,
  suggestion: m.suggestion,
});

export async function listFixedBills(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = listFixedBillsInputSchema.parse(args ?? {});
  const month = input.month ?? currentMonth();
  const bills = (await selectFixedItems(caller.userId)).filter((b) =>
    isActive(b, month),
  );
  const paid = new Set(await selectPaidBillIds(caller.userId, month));
  const [history, lastCharges] = await Promise.all([
    selectFixedItemHistory(caller.userId),
    selectLastCharges(caller.userId),
  ]);

  // Saved expenses this month that look like a bill but aren't linked to it:
  // suggest merging them (mark_bill_paid with expense_id) so they count once.
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const loose = (
    await selectExpensesWithStatus(caller.userId, monthStart, monthEnd)
  ).filter((e) => !e.fixedItemId);
  const unlinked = new Map<string, Record<string, unknown>[]>();
  for (const e of loose) {
    for (const m of matchBills(
      bills.filter((b) => !paid.has(b.id)),
      {
        merchant: e.description,
        amountCents: e.amountCents,
        date: e.spentOn,
      },
    )) {
      const list = unlinked.get(m.bill.id) ?? [];
      list.push({
        expense_id: e.id,
        date: e.spentOn,
        description: e.description,
        amount: dollars(e.amountCents),
        suggestion: `"${e.description}" (${money(e.amountCents)} on ${e.spentOn}) looks like ${m.bill.name}. Merge it into the fixed bill (mark_bill_paid with expense_id) so it counts once?`,
      });
      unlinked.set(m.bill.id, list);
    }
  }

  const withMerges = [...unlinked.values()].flat().length;
  return {
    summary: `${bills.length} fixed bill(s) in ${month}, ${bills.filter((b) => paid.has(b.id)).length} marked paid.${withMerges ? ` ${withMerges} saved expense(s) look like one of these bills but aren't linked: suggest merging them.` : ""}`,
    data: {
      month,
      bills: bills.map((b) => {
        const series = b.seriesId ?? b.id;
        const last = lastCharges.get(series);
        return {
          ...billData(b, paid.has(b.id)),
          last_charged_on: last?.paidOn ?? null,
          last_charged_amount: last ? dollars(last.amountCents) : null,
          amount_history: history
            .filter((h) => h.seriesId === series)
            .map((h) => ({
              from_month: h.startMonth,
              to_month: h.endMonth,
              amount: dollars(h.amountCents),
              is_estimate: h.isEstimate,
            })),
          ...(unlinked.has(b.id)
            ? { possible_unlinked_expenses: unlinked.get(b.id) }
            : {}),
        };
      }),
    },
  };
}

export async function addFixedBill(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = addFixedBillInputSchema.parse(args);
  const startMonth = input.start_month ?? currentMonth();
  const id = await insertFixedItem(caller.userId, {
    name: input.name,
    category: input.category,
    amountCents: toCents(input.amount),
    dueDay: input.due_day ?? null,
    startMonth,
    merchant: input.merchant || null,
    matchKeywords: cleanKeywords(input.match_keywords ?? []),
    isEstimate: input.is_estimate ?? false,
  });
  return {
    summary: `Added fixed bill ${input.name}, ${money(toCents(input.amount))} a month from ${startMonth}${input.is_estimate ? " (an estimate)" : ""}.`,
    data: {
      id,
      name: input.name,
      amount: input.amount,
      start_month: startMonth,
    },
  };
}

export async function editFixedBill(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = editFixedBillInputSchema.parse(args);
  const fromMonth = input.from_month ?? currentMonth();
  const picked = await selectFixedItem(caller.userId, input.id);
  if (!picked) return notFound("fixed bill", "list_fixed_bills");
  // An id from an earlier month still finds the row that runs in fromMonth.
  const bill =
    (await selectFixedItemInMonth(caller.userId, input.id, fromMonth)) ??
    picked;
  if (!isActive(bill, fromMonth)) {
    return {
      summary: `${bill.name} isn't active in ${fromMonth}. Pick a month it runs in (from ${bill.startMonth}${bill.endMonth ? ` to ${bill.endMonth}` : ""}).`,
      data: billData(bill),
      isError: true,
    };
  }
  const amountCents =
    input.amount === undefined ? bill.amountCents : toCents(input.amount);
  // A real amount replaces an estimate unless the AI says it's still one.
  const isEstimate =
    input.is_estimate ??
    (input.amount !== undefined && amountCents !== bill.amountCents
      ? false
      : undefined);
  await updateFixedItemFor(caller.userId, bill.id, {
    name: input.name ?? bill.name,
    category:
      input.category ?? (isCategory(bill.category) ? bill.category : "Other"),
    amount: amountCents,
    dueDay: input.due_day === undefined ? bill.dueDay : input.due_day,
    month: fromMonth,
    isEstimate,
    matchKeywords: input.match_keywords,
    merchant: input.merchant,
  });
  return {
    summary: `${input.name ?? bill.name} updated from ${fromMonth} on${input.amount === undefined ? "" : `: ${money(bill.amountCents)} → ${money(amountCents)}`}. Earlier months keep the old values.`,
    data: {
      name: input.name ?? bill.name,
      from_month: fromMonth,
      amount: dollars(amountCents),
      previous_amount: dollars(bill.amountCents),
      is_estimate: isEstimate ?? bill.isEstimate ?? false,
    },
  };
}

export async function markBillPaid(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = markBillPaidInputSchema.parse(args);
  const bill =
    (await selectFixedItemInMonth(caller.userId, input.id, input.month)) ??
    (await selectFixedItem(caller.userId, input.id));
  if (!bill) return notFound("fixed bill", "list_fixed_bills");
  if (!isActive(bill, input.month)) {
    return {
      summary: `${bill.name} isn't a bill in ${input.month}, so it can't be marked paid then.`,
      data: billData(bill),
      isError: true,
    };
  }
  if (input.expense_id) {
    const expense = await selectExpenseById(caller.userId, input.expense_id);
    if (!expense) return notFound("expense", "list_expenses");
    if (expense.month !== input.month) {
      return {
        summary: `That expense is in ${expense.month}, not ${input.month}. Mark the bill paid for ${expense.month} instead.`,
        data: { expense_id: input.expense_id, month: expense.month },
        isError: true,
      };
    }
    let target = bill;
    if (input.update_amount && expense.amountCents !== bill.amountCents) {
      await updateFixedItemFor(caller.userId, bill.id, {
        name: bill.name,
        category: isCategory(bill.category) ? bill.category : "Other",
        amount: expense.amountCents,
        dueDay: bill.dueDay,
        month: input.month,
        isEstimate: false,
        matchKeywords: undefined,
      });
      target =
        (await selectFixedItemInMonth(caller.userId, bill.id, input.month)) ??
        bill;
    }
    await linkExpenseToBillRow(caller.userId, expense.id, target.id);
    return {
      summary: `Marked ${bill.name} paid for ${input.month} with "${expense.description}" (${money(expense.amountCents)}). The expense is now the bill's payment, so it counts once.${input.update_amount && expense.amountCents !== bill.amountCents ? ` The bill is now ${money(expense.amountCents)} from ${input.month} on.` : ""}`,
      data: {
        id: target.id,
        name: bill.name,
        month: input.month,
        paid: true,
        expense_id: expense.id,
        amount: dollars(
          input.update_amount ? expense.amountCents : bill.amountCents,
        ),
      },
    };
  }

  await insertBillPayment(caller.userId, bill.id, input.month, {
    paidOn: input.paid_on ?? null,
    amountCents: input.paid_on ? bill.amountCents : null,
  });
  return {
    summary: `Marked ${bill.name} paid for ${input.month}.${input.paid_on ? ` It comes off the bank balance as paid on ${input.paid_on}.` : " Without paid_on it doesn't change the bank balance."}`,
    data: {
      id: bill.id,
      name: bill.name,
      month: input.month,
      paid: true,
      paid_on: input.paid_on ?? null,
    },
  };
}

export async function findMatchingFixedBill(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = findMatchingFixedBillInputSchema.parse(args);
  const month = monthOfDate(input.date);
  const tolerance =
    input.tolerance_percent === undefined
      ? DEFAULT_AMOUNT_TOLERANCE
      : input.tolerance_percent / 100;
  const matches = matchBills(
    await activeBills(caller.userId, month),
    {
      merchant: input.merchant,
      description: input.description,
      amountCents: toCents(input.amount),
      date: input.date,
    },
    tolerance,
  );
  if (matches.length === 0) {
    return {
      summary: `No fixed bill in ${month} looks like this. If the email says it repeats (subscription, monthly plan, auto-renewal), ask the user whether to add it as a fixed bill (add_expense with is_subscription: true, or add_fixed_bill). Otherwise it's a normal expense (add_expense with is_subscription: false).`,
      data: { month, matches: [] },
    };
  }
  return {
    summary: `${matches.length} possible fixed bill(s). Best: ${matches[0]?.suggestion}`,
    data: { month, matches: matches.map(matchData) },
  };
}

export async function convertExpenseToFixedBill(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = convertExpenseToFixedBillInputSchema.parse(args);
  if (input.pending_id) {
    const item = await selectPendingExpense(caller.userId, input.pending_id);
    if (!item) return notFound("pending item", "list_expenses");
    await setPendingBill(caller.userId, item.id, {
      isSubscription: true,
      fixedItemId: null,
    });
    return {
      summary: `Marked "${item.description}" as a subscription. When the user approves it on the Review page (${REVIEW_URL}), it becomes a fixed bill of ${money(item.amountCents)} a month, with this charge as its first paid month.`,
      data: { pending_id: item.id, is_subscription: true },
    };
  }

  const expense = await selectExpenseById(
    caller.userId,
    String(input.expense_id),
  );
  if (!expense) return notFound("expense", "list_expenses");
  if (expense.fixedItemId) {
    return {
      summary:
        "That expense is already a fixed bill's payment. Call list_fixed_bills to see it.",
      data: { expense_id: expense.id, fixed_bill_id: expense.fixedItemId },
      isError: true,
    };
  }
  const category =
    input.category ??
    (isCategory(expense.category) ? expense.category : "Other");
  const name = input.name ?? expense.description;
  const billId = await insertFixedItem(caller.userId, {
    name,
    category,
    amountCents: expense.amountCents,
    dueDay: input.due_day ?? Number(expense.spentOn.slice(8, 10)),
    startMonth: expense.month,
    merchant: input.merchant || null,
    matchKeywords: cleanKeywords(
      input.match_keywords ?? [input.merchant ?? expense.description],
    ),
  });
  await linkExpenseToBillRow(caller.userId, expense.id, billId);
  return {
    summary: `Made "${name}" a fixed bill of ${money(expense.amountCents)} a month from ${expense.month}, with this expense as its first paid month.`,
    data: {
      fixed_bill_id: billId,
      name,
      amount: dollars(expense.amountCents),
      start_month: expense.month,
      expense_id: expense.id,
    },
  };
}

export async function unlinkFixedBill(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = unlinkFixedBillInputSchema.parse(args);
  if (input.pending_id) {
    const saved = await setPendingBill(caller.userId, input.pending_id, {
      fixedItemId: null,
      isSubscription: false,
    });
    if (!saved) return notFound("pending item", "list_expenses");
    return {
      summary:
        "It's no longer linked to a fixed bill or marked a subscription. Approving it adds it as a normal expense.",
      data: { pending_id: input.pending_id, is_subscription: false },
    };
  }
  const expense = await selectExpenseById(
    caller.userId,
    String(input.expense_id),
  );
  if (!expense) return notFound("expense", "list_expenses");
  if (!(await unlinkExpenseFromBillRow(caller.userId, expense.id))) {
    return {
      summary:
        "That expense wasn't linked to a fixed bill, so nothing changed.",
      data: { expense_id: expense.id },
    };
  }
  return {
    summary: `"${expense.description}" is a normal expense again, and the bill's month it paid is no longer marked paid by it.`,
    data: { expense_id: expense.id, fixed_bill_id: null },
  };
}
