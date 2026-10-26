import "server-only";
import { updateFixedItemFor } from "@/dal/fixed-items";
import { selectBankBalance, upsertBankBalance } from "@/db/bank-balance";
import { insertBillPayment, selectPaidBillIds } from "@/db/bill-payments";
import {
  deleteExpenseRow,
  markExpensePaidRow,
  selectExpenseById,
  selectExpensesWithStatus,
  setExpenseReceipt,
  updateExpenseRow,
} from "@/db/expenses";
import {
  insertFixedItem,
  selectFixedItem,
  selectFixedItems,
} from "@/db/fixed-items";
import {
  insertPendingExpense,
  markPendingPaid,
  selectDuplicateMatch,
  selectPendingExpenses,
  setPendingReceipt,
} from "@/db/pending-expenses";
import { isActive } from "@/lib/budget";
import { CATEGORIES, isCategory } from "@/lib/categories";
import { currentMonth, monthOfDate, today } from "@/lib/month";
import {
  type AddExpenseInput,
  addExpenseInputSchema,
  addFixedBillInputSchema,
  attachReceiptInputSchema,
  deleteExpenseInputSchema,
  duplicateMessage,
  editExpenseInputSchema,
  editFixedBillInputSchema,
  listExpensesInputSchema,
  listFixedBillsInputSchema,
  markBillPaidInputSchema,
  markExpensePaidInputSchema,
  type ReceiptDetails,
  type ReceiptInput,
  syncBankBalanceInputSchema,
  toCents,
} from "@/lib/pending-expenses";
import {
  isJpeg,
  MAX_IMAGE_BYTES,
  newReceiptImagePathname,
} from "@/lib/receipt-image";
import { deleteReceiptImage, putReceiptImage } from "@/lib/receipt-store";

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

/** Input a schema can't catch (a bad image, an empty receipt), as a readable tool error. */
class ToolInputError extends Error {}

const notFound = (what: string, lookup: string): ToolResult => ({
  summary: `No ${what} with that id. Call ${lookup} to find it.`,
  data: {},
  isError: true,
});

/**
 * Turns a receipt from the AI into what's stored: amounts in cents and, when
 * it sent a JPEG, the photo saved to the caller's own folder in the private
 * store. Throws ToolInputError for an image that isn't a JPEG or is too big.
 */
async function storeReceipt(
  userId: string,
  input: ReceiptInput,
): Promise<ReceiptDetails> {
  const details = {
    merchant: input.merchant || null,
    purchasedOn: input.purchased_on ?? null,
    subtotalCents:
      input.subtotal === undefined ? null : toCents(input.subtotal),
    taxCents: input.tax === undefined ? null : toCents(input.tax),
    totalCents: input.total === undefined ? null : toCents(input.total),
    rawText: input.text?.trim() || null,
  };
  const hasDetails = Object.values(details).some((v) => v !== null);
  if (!hasDetails && !input.image_jpeg_base64) {
    throw new ToolInputError(
      "The receipt is empty. Send at least its total, text or a JPEG.",
    );
  }

  let imagePathname: string | null = null;
  if (input.image_jpeg_base64) {
    const bytes = new Uint8Array(
      Buffer.from(input.image_jpeg_base64, "base64"),
    );
    if (!isJpeg(bytes)) {
      throw new ToolInputError(
        "The image isn't a JPEG. Send the receipt's text instead (e.g. from its PDF).",
      );
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new ToolInputError("The image is larger than 3MB.");
    }
    imagePathname = newReceiptImagePathname(userId);
    await putReceiptImage(
      imagePathname,
      new Blob([bytes], { type: "image/jpeg" }),
    );
  }
  return { ...details, imagePathname };
}

/** Runs `tool`, turning a ToolInputError into a tool error the AI can read. */
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

  const receipt = input.receipt
    ? await storeReceipt(caller.userId, input.receipt)
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
  });
  const notes = [
    input.unpaid
      ? "Marked not paid yet: it stays off the bank balance until mark_expense_paid."
      : null,
    receipt ? "Receipt attached." : null,
  ].filter(Boolean);
  return {
    summary: `Sent to Pending Review: ${input.merchant}, $${input.amount.toFixed(2)} on ${input.date} (${input.category}). The user approves it in Budget at ${REVIEW_URL} before it counts as an expense.${notes.length ? ` ${notes.join(" ")}` : ""}`,
    data: {
      status: "pending_review",
      id,
      review_url: REVIEW_URL,
      unpaid: input.unpaid ?? false,
      has_receipt: receipt !== null,
    },
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
    summary: `Bank balance set to $${input.balance.toFixed(2)}. Expenses dated today or later, added from now on, come off it; anything dated earlier is already in this number.`,
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
  return friendly(async () => {
    const input = attachReceiptInputSchema.parse(args);
    // Check the target first, so a photo is never stored for nothing.
    if (input.expense_id) {
      if (!(await selectExpenseById(caller.userId, input.expense_id))) {
        return notFound("expense", "list_expenses");
      }
    } else if (
      !(await selectPendingExpenses(caller.userId)).some(
        (p) => p.id === input.pending_id,
      )
    ) {
      return notFound("pending item", "list_expenses");
    }

    const receipt = await storeReceipt(caller.userId, input);
    const result = input.expense_id
      ? await setExpenseReceipt(caller.userId, input.expense_id, receipt)
      : await setPendingReceipt(
          caller.userId,
          String(input.pending_id),
          receipt,
        );
    if (!result) {
      if (receipt.imagePathname)
        await deleteReceiptImage(receipt.imagePathname);
      return notFound("expense", "list_expenses");
    }
    if (result.replacedImage) await deleteReceiptImage(result.replacedImage);
    return {
      summary: `Receipt attached${receipt.imagePathname ? " with its photo" : ""}.`,
      data: {
        id: input.expense_id ?? input.pending_id,
        kind: input.expense_id ? "expense" : "pending",
        has_photo: receipt.imagePathname !== null,
        replaced_photo: Boolean(result.replacedImage),
      },
    };
  });
}

const billData = (
  bill: {
    id: string;
    name: string;
    category: string;
    amountCents: number;
    dueDay: number | null;
    startMonth: string;
    endMonth: string | null;
  },
  paid?: boolean,
) => ({
  id: bill.id,
  name: bill.name,
  category: bill.category,
  amount: dollars(bill.amountCents),
  due_day: bill.dueDay,
  start_month: bill.startMonth,
  end_month: bill.endMonth,
  ...(paid === undefined ? {} : { paid_this_month: paid }),
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
  return {
    summary: `${bills.length} fixed bill(s) in ${month}, ${bills.filter((b) => paid.has(b.id)).length} marked paid.`,
    data: {
      month,
      bills: bills.map((b) => billData(b, paid.has(b.id))),
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
  });
  return {
    summary: `Added fixed bill ${input.name}, ${money(toCents(input.amount))} a month from ${startMonth}.`,
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
  const bill = await selectFixedItem(caller.userId, input.id);
  if (!bill) return notFound("fixed bill", "list_fixed_bills");
  if (!isActive(bill, input.from_month)) {
    return {
      summary: `${bill.name} isn't active in ${input.from_month}. Pick a month it runs in (from ${bill.startMonth}${bill.endMonth ? ` to ${bill.endMonth}` : ""}).`,
      data: billData(bill),
      isError: true,
    };
  }
  const amountCents =
    input.amount === undefined ? bill.amountCents : toCents(input.amount);
  await updateFixedItemFor(caller.userId, input.id, {
    name: input.name ?? bill.name,
    category:
      input.category ?? (isCategory(bill.category) ? bill.category : "Other"),
    amount: amountCents,
    dueDay: input.due_day === undefined ? bill.dueDay : input.due_day,
    month: input.from_month,
  });
  return {
    summary: `${input.name ?? bill.name} updated from ${input.from_month} on${input.amount === undefined ? "" : `: ${money(bill.amountCents)} → ${money(amountCents)}`}. Earlier months keep the old values.`,
    data: {
      name: input.name ?? bill.name,
      from_month: input.from_month,
      amount: dollars(amountCents),
      previous_amount: dollars(bill.amountCents),
    },
  };
}

export async function markBillPaid(
  caller: McpCaller,
  args: unknown,
): Promise<ToolResult> {
  const input = markBillPaidInputSchema.parse(args);
  const bill = await selectFixedItem(caller.userId, input.id);
  if (!bill) return notFound("fixed bill", "list_fixed_bills");
  if (!isActive(bill, input.month)) {
    return {
      summary: `${bill.name} isn't a bill in ${input.month}, so it can't be marked paid then.`,
      data: billData(bill),
      isError: true,
    };
  }
  await insertBillPayment(caller.userId, bill.id, input.month);
  return {
    summary: `Marked ${bill.name} paid for ${input.month}.`,
    data: { id: bill.id, name: bill.name, month: input.month, paid: true },
  };
}
