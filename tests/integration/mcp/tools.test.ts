import { describe, expect, it } from "vitest";
import { setBankBalance } from "@/actions/bank-balance";
import { createExpense } from "@/actions/expenses";
import { approvePendingExpense } from "@/actions/pending-expenses";
import { getBankBalance } from "@/dal/bank-balance";
import { insertExpenseLines } from "@/db/expenses";
import {
  addExpense,
  deleteExpense,
  editExpense,
  listCategories,
  listExpenses,
  type McpCaller,
  syncBankBalance,
} from "@/mcp/tools";
import { rows } from "../../helpers/test-db";

/*
 * The MCP tools against the real schema. `caller` stands in for what the
 * route's token check produced; tools never take the user from arguments.
 */

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Muse" };

const shell = {
  amount: 45.67,
  date: "2026-10-20",
  merchant: "Shell",
  category: "Transportation",
  source: "Email from receipts@shell.ca: Your receipt",
};

const pendingRows = () =>
  rows(
    "select user_id, spent_on::text as spent_on, description, merchant, category, amount_cents, source, client from pending_expenses order by created_at",
  );
const expenseRows = () =>
  rows("select id, user_id, description, amount_cents from expenses");

async function savedExpense(description = "Costco run", amount = "123.45") {
  await createExpense({
    description,
    category: "Groceries",
    amount,
    spentOn: "2026-10-20",
  });
  const [row] = await rows("select id from expenses where description = $1", [
    description,
  ]);
  return String(row?.id);
}

describe("list_categories", () => {
  it("lists the app's categories with examples", () => {
    const result = listCategories();
    const categories = result.data.categories as { name: string }[];
    expect(categories.map((c) => c.name)).toContain("Transportation");
    expect(categories[0]).toHaveProperty("examples");
  });

  it("leaves the examples out when asked", () => {
    const result = listCategories({ include_examples: false });
    const [first] = result.data.categories as Record<string, unknown>[];
    expect(first).toHaveProperty("name");
    expect(first).not.toHaveProperty("examples");
  });
});

describe("add_expense", () => {
  it("sends the charge to review instead of saving an expense", async () => {
    const result = await addExpense(A, shell);
    expect(result.data).toMatchObject({ status: "pending_review" });
    expect(result.summary).toContain("Pending Review");
    expect(await pendingRows()).toEqual([
      {
        user_id: "user_a",
        spent_on: "2026-10-20",
        description: "Shell",
        merchant: "Shell",
        category: "Transportation",
        amount_cents: 4_567,
        source: "Email from receipts@shell.ca: Your receipt",
        client: "Claude",
      },
    ]);
    expect(await expenseRows()).toHaveLength(0);
  });

  it("uses a description when the AI gives one", async () => {
    await addExpense(A, { ...shell, description: "Gas for the truck" });
    expect((await pendingRows())[0]).toMatchObject({
      description: "Gas for the truck",
      merchant: "Shell",
    });
  });

  it("flags a saved expense with the same amount and day, saving nothing", async () => {
    await savedExpense("Shell gas", "45.67");
    const result = await addExpense(A, shell);
    expect(result.data).toMatchObject({
      status: "possible_duplicate",
      match: { kind: "expense", description: "Shell gas", amount: 45.67 },
    });
    expect(result.summary).toContain("allow_duplicate: true");
    expect(await pendingRows()).toHaveLength(0);
  });

  it("flags a second email about a purchase already waiting for review", async () => {
    await addExpense(A, { ...shell, merchant: "Amazon", source: "Order" });
    const result = await addExpense(A, {
      ...shell,
      merchant: "Amazon.ca",
      source: "Shipped",
    });
    expect(result.data).toMatchObject({
      status: "possible_duplicate",
      match: { kind: "pending" },
    });
    expect(await pendingRows()).toHaveLength(1);
  });

  it("adds it anyway once the user says it's a separate charge", async () => {
    await addExpense(A, shell);
    const result = await addExpense(A, { ...shell, allow_duplicate: true });
    expect(result.data).toMatchObject({ status: "pending_review" });
    expect(await pendingRows()).toHaveLength(2);
  });

  it("treats a scanned receipt's split parts as one total", async () => {
    await insertExpenseLines(
      "user_a",
      { month: "2026-10", spentOn: "2026-10-20", description: "Co-op" },
      [
        { category: "Groceries", amountCents: 2_000 },
        { category: "Alcohol", amountCents: 1_000 },
      ],
      {
        imagePathname: "receipts/user_a/coop.jpg",
        merchant: "Co-op",
        purchasedOn: "2026-10-20",
        subtotalCents: null,
        taxCents: null,
        totalCents: 3_000,
        rawText: null,
      },
    );
    expect((await addExpense(A, { ...shell, amount: 30 })).data).toMatchObject({
      status: "possible_duplicate",
      match: { amount: 30 },
    });
    // One part on its own is a different amount.
    expect((await addExpense(A, { ...shell, amount: 20 })).data).toMatchObject({
      status: "pending_review",
    });
  });

  it("doesn't call another user's expense a duplicate", async () => {
    await addExpense(B, shell);
    expect((await addExpense(A, shell)).data).toMatchObject({
      status: "pending_review",
    });
  });

  it("refuses bad input without saving", async () => {
    await expect(addExpense(A, { ...shell, amount: -1 })).rejects.toThrow();
    await expect(
      addExpense(A, { ...shell, category: "Made up" }),
    ).rejects.toThrow();
    expect(await pendingRows()).toHaveLength(0);
  });
});

describe("approving what the AI added", () => {
  it("becomes one normal expense that comes off the bank balance once", async () => {
    await setBankBalance({ balance: "500" });
    await rows(
      // Entered Oct 1, so the Oct 20 charges below count.
      "update bank_balances set updated_at = '2026-10-01T18:00:00Z'",
    );
    const { data } = await addExpense(A, shell);
    expect((await getBankBalance())?.balanceCents).toBe(50_000);
    expect(await approvePendingExpense(String(data.id))).toEqual({ ok: true });
    expect(await approvePendingExpense(String(data.id))).toMatchObject({
      ok: false,
    });
    expect(await expenseRows()).toHaveLength(1);
    expect((await getBankBalance())?.balanceCents).toBe(50_000 - 4_567);
  });
});

describe("sync_bank_balance", () => {
  it("sets the balance to what the bank says, never subtracting", async () => {
    await setBankBalance({ balance: "1000" });
    await rows(
      // Entered Oct 1, so the Oct 20 charge below counts.
      "update bank_balances set updated_at = '2026-10-01T18:00:00Z'",
    );
    await savedExpense("Shell", "45.67");
    expect((await getBankBalance())?.balanceCents).toBe(100_000 - 4_567);

    // The bank's alert already reflects that charge.
    const result = await syncBankBalance(A, { balance: 954.33 });
    expect(result.data).toMatchObject({ balance: 954.33 });
    expect((await getBankBalance())?.balanceCents).toBe(95_433);
  });

  it("doesn't take older charges off again when they're approved after a sync", async () => {
    // The AI syncs today's balance, then the user approves an Oct 17 charge.
    await syncBankBalance(A, { balance: -774.61 });
    const { data } = await addExpense(A, { ...shell, date: "2026-10-17" });
    expect(await approvePendingExpense(String(data.id))).toEqual({ ok: true });
    expect((await getBankBalance())?.balanceCents).toBe(-77_461);
  });

  it("takes an overdrawn balance", async () => {
    await syncBankBalance(A, { balance: -12.5 });
    expect((await getBankBalance())?.balanceCents).toBe(-1_250);
  });

  it("only changes the caller's balance", async () => {
    await syncBankBalance(B, { balance: 10 });
    expect(await getBankBalance()).toBeNull();
  });
});

describe("list_expenses", () => {
  it("lists the caller's expenses and pending items in the range", async () => {
    const id = await savedExpense();
    await addExpense(A, shell);
    await addExpense(B, { ...shell, merchant: "Other user" });
    const result = await listExpenses(A, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(result.data.expenses).toEqual([
      {
        id,
        date: "2026-10-20",
        description: "Costco run",
        category: "Groceries",
        amount: 123.45,
        unpaid: false,
        has_receipt: false,
        fixed_bill_id: null,
      },
    ]);
    expect(result.data.pending_review).toEqual([
      expect.objectContaining({ merchant: "Shell", amount: 45.67 }),
    ]);
  });

  it("leaves out days outside the range", async () => {
    await savedExpense();
    const result = await listExpenses(A, {
      from: "2026-10-21",
      to: "2026-10-31",
    });
    expect(result.data.expenses).toEqual([]);
  });

  it("rejects a backwards range", async () => {
    const result = await listExpenses(A, {
      from: "2026-10-31",
      to: "2026-10-01",
    });
    expect(result.isError).toBe(true);
  });
});

describe("edit_expense", () => {
  it("changes only the fields given", async () => {
    const id = await savedExpense();
    await editExpense(A, { id, amount: 100, date: "2026-09-30" });
    expect(
      await rows(
        "select month, spent_on::text as spent_on, description, category, amount_cents from expenses",
      ),
    ).toEqual([
      {
        month: "2026-09",
        spent_on: "2026-09-30",
        description: "Costco run",
        category: "Groceries",
        amount_cents: 10_000,
      },
    ]);
  });

  it("can't touch another user's expense", async () => {
    const id = await savedExpense();
    const result = await editExpense(B, { id, amount: 1 });
    expect(result.isError).toBe(true);
    expect((await expenseRows())[0]).toMatchObject({ amount_cents: 12_345 });
  });
});

describe("delete_expense", () => {
  it("deletes the caller's expense", async () => {
    const id = await savedExpense();
    const result = await deleteExpense(A, { id });
    expect(result.data).toEqual({ id, deleted: true });
    expect(await expenseRows()).toHaveLength(0);
  });

  it("can't delete another user's expense", async () => {
    const id = await savedExpense();
    expect((await deleteExpense(B, { id })).isError).toBe(true);
    expect(await expenseRows()).toHaveLength(1);
  });

  it("says when the id doesn't exist", async () => {
    const result = await deleteExpense(A, {
      id: "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10",
    });
    expect(result.isError).toBe(true);
  });
});
