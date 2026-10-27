import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { ConflictError, NotFoundError } from "@/dal/errors";
import { updateFixedItemFor } from "@/dal/fixed-items";
import {
  linkExpenseToBillRow,
  selectBillPaymentExpenseId,
} from "@/db/bill-payments";
import { selectExpenseById, selectExpensesBetween } from "@/db/expenses";
import {
  insertFixedItem,
  selectFixedItemInMonth,
  selectFixedItems,
} from "@/db/fixed-items";
import { cleanKeywords } from "@/lib/bill-matching";
import { type Category, isCategory } from "@/lib/categories";
import { addMonths } from "@/lib/month";
import type {
  ConvertSubscriptionsInput,
  ConvertSubscriptionsResult,
  MakeFixedBillInput,
} from "@/lib/schemas/expense-bills";
import {
  CANDIDATE_MONTHS,
  findSubscriptionCandidates,
  type SubscriptionCandidate,
} from "@/lib/subscription-candidates";
import type { Expense, FixedItem } from "@/lib/types";

/*
 * Turning saved expenses into fixed bills. The "…For" functions take a
 * verified `userId` and are shared by the MCP tools (convert_expense_to_fixed_bill,
 * mark_bill_paid with expense_id) and the Spending page, so both convert the
 * same way. Either way the expense becomes that month's payment of the bill
 * (linked, not copied): it comes off the bank balance once and stops counting
 * as extra spending.
 */

/* ---------- Shared with the MCP tools ---------- */

export type NewBillOptions = {
  name?: string;
  category?: Category;
  /** Undefined: the day it was charged. Null: no due day. */
  dueDay?: number | null;
  merchant?: string | null;
  matchKeywords?: string[];
};

/**
 * Makes a saved expense a new monthly fixed bill of its amount, starting in its
 * month, with the expense as that month's payment.
 */
export async function createBillFromExpenseFor(
  userId: string,
  expense: Expense,
  options: NewBillOptions = {},
) {
  const category =
    options.category ??
    (isCategory(expense.category) ? expense.category : "Other");
  const name = options.name ?? expense.description;
  const billId = await insertFixedItem(userId, {
    name,
    category,
    amountCents: expense.amountCents,
    dueDay:
      options.dueDay === undefined
        ? Number(expense.spentOn.slice(8, 10))
        : options.dueDay,
    startMonth: expense.month,
    merchant: options.merchant || null,
    matchKeywords: cleanKeywords(
      options.matchKeywords ?? [options.merchant || expense.description],
    ),
  });
  await linkExpenseToBillRow(userId, expense.id, billId);
  return { billId, name, category };
}

export type PayWithExpenseResult =
  | {
      ok: true;
      /** The bill's row for the expense's month, after any amount update. */
      bill: FixedItem;
      previousAmountCents: number;
      amountUpdated: boolean;
    }
  | { ok: false; reason: "not_active" }
  | { ok: false; reason: "paid_by_other"; bill: FixedItem };

/**
 * Makes a saved expense `billId`'s payment for the expense's month. With
 * `updateAmount`, the bill first takes the expense's amount from that month on
 * (and stops being an estimate). Refuses a month the bill doesn't run in, or
 * one another expense already paid, so nothing is counted twice or dropped.
 */
export async function payBillWithExpenseFor(
  userId: string,
  billId: string,
  expense: Expense,
  { updateAmount = false }: { updateAmount?: boolean } = {},
): Promise<PayWithExpenseResult> {
  const bill = await selectFixedItemInMonth(userId, billId, expense.month);
  if (!bill) return { ok: false, reason: "not_active" };
  const paidBy = await selectBillPaymentExpenseId(
    userId,
    bill.id,
    expense.month,
  );
  if (paidBy && paidBy !== expense.id) {
    return { ok: false, reason: "paid_by_other", bill };
  }

  let target = bill;
  const change =
    updateAmount &&
    (expense.amountCents !== bill.amountCents || Boolean(bill.isEstimate));
  if (change) {
    await updateFixedItemFor(userId, bill.id, {
      name: bill.name,
      category: isCategory(bill.category) ? bill.category : "Other",
      amount: expense.amountCents,
      dueDay: bill.dueDay,
      month: expense.month,
      isEstimate: false,
      matchKeywords: undefined,
    });
    target =
      (await selectFixedItemInMonth(userId, bill.id, expense.month)) ?? bill;
  }
  await linkExpenseToBillRow(userId, expense.id, target.id);
  return {
    ok: true,
    bill: target,
    previousAmountCents: bill.amountCents,
    amountUpdated: change,
  };
}

/* ---------- The Spending page (signed-in user) ---------- */

/** The user's expense, if it can still become a bill's payment. */
async function convertibleExpense(userId: string, id: string) {
  const expense = await selectExpenseById(userId, id);
  if (!expense) throw new NotFoundError("That expense no longer exists.");
  if (expense.fixedItemId) {
    throw new ConflictError(
      `“${expense.description}” is already a fixed bill's payment.`,
    );
  }
  if (expense.unpaid) {
    throw new ConflictError(
      `“${expense.description}” isn't paid yet. Mark it paid first, then make it a bill.`,
    );
  }
  return expense;
}

function payFailure(
  result: Exclude<PayWithExpenseResult, { ok: true }>,
  expense: Expense,
) {
  return result.reason === "not_active"
    ? `That bill doesn't run in ${expense.month}, so “${expense.description}” can't be its payment.`
    : `${result.bill.name} is already paid for ${expense.month} by another expense.`;
}

/**
 * The row's "Make fixed bill": a new monthly bill from the expense, or this
 * month's payment of a bill the user already has.
 */
export async function makeExpenseFixedBill(input: MakeFixedBillInput) {
  const userId = await currentUserIdOrThrow();
  const expense = await convertibleExpense(userId, input.expenseId);
  if (input.mode === "new") {
    await createBillFromExpenseFor(userId, expense, {
      name: input.name,
      category: input.category,
      dueDay: input.dueDay,
      matchKeywords: input.matchKeywords,
    });
    return;
  }
  const result = await payBillWithExpenseFor(
    userId,
    input.fixedItemId,
    expense,
    { updateAmount: input.updateAmount },
  );
  if (!result.ok) throw new ConflictError(payFailure(result, expense));
}

/**
 * Saved expenses from the last few months up to `month` that look like
 * subscriptions or memberships, grouped into the bills they'd become.
 */
export async function getSubscriptionCandidates(
  month: string,
): Promise<SubscriptionCandidate[]> {
  const userId = await currentUserIdOrThrow();
  const [expenses, bills] = await Promise.all([
    selectExpensesBetween(
      userId,
      addMonths(month, -(CANDIDATE_MONTHS - 1)),
      month,
    ),
    selectFixedItems(userId),
  ]);
  return findSubscriptionCandidates(expenses, bills);
}

/**
 * The bulk "Find subscriptions": each picked group becomes one bill (or pays
 * one the user has), with each of its charges as its month's payment. Every
 * charge is checked before anything is saved.
 */
export async function convertSubscriptions(
  input: ConvertSubscriptionsInput,
): Promise<ConvertSubscriptionsResult> {
  const userId = await currentUserIdOrThrow();

  const seen = new Set<string>();
  const groups: { item: (typeof input.items)[number]; charges: Expense[] }[] =
    [];
  for (const item of input.items) {
    const charges: Expense[] = [];
    for (const id of item.expenseIds) {
      if (seen.has(id)) {
        throw new ConflictError("An expense can only become one bill.");
      }
      seen.add(id);
      charges.push(await convertibleExpense(userId, id));
    }
    charges.sort((a, b) => a.spentOn.localeCompare(b.spentOn));
    if (new Set(charges.map((c) => c.month)).size !== charges.length) {
      throw new ConflictError(
        `“${item.name}” has two charges in one month. A fixed bill is paid once a month.`,
      );
    }
    groups.push({ item, charges });
  }

  const result: ConvertSubscriptionsResult = {
    created: 0,
    payments: 0,
    skipped: 0,
  };
  for (const { item, charges } of groups) {
    let billId = item.fixedItemId;
    let rest = charges;
    if (!billId) {
      const [first, ...later] = charges;
      if (!first) continue;
      const created = await createBillFromExpenseFor(userId, first, {
        name: item.name,
        category: item.category,
        dueDay: Number((charges.at(-1) ?? first).spentOn.slice(8, 10)),
        matchKeywords: [...new Set(charges.map((c) => c.description))],
      });
      billId = created.billId;
      result.created++;
      result.payments++;
      rest = later;
    }
    // A new bill follows its charges' prices; an existing one only when asked.
    const updateAmount = item.fixedItemId ? item.updateAmount === true : true;
    for (const charge of rest) {
      const paid = await payBillWithExpenseFor(userId, billId, charge, {
        updateAmount,
      });
      if (paid.ok) result.payments++;
      else result.skipped++;
    }
  }
  return result;
}
