import { describe, expect, it } from "vitest";
import { createExpense, updateExpense } from "@/actions/expenses";
import {
  approvePendingExpense,
  editPendingExpense,
} from "@/actions/pending-expenses";
import { buildMonthOverview } from "@/dal/overview";
import { getPendingExpenses } from "@/dal/pending-expenses";
import { insertAccount, selectAccount } from "@/db/accounts";
import { selectExpenditures } from "@/db/receipt-export";
import { CASH } from "@/lib/expense-accounts";
import type { ExpenseFormValues } from "@/lib/schemas";
import {
  addExpense,
  attachReceipt,
  editExpense,
  listExpenses,
  type McpCaller,
} from "@/mcp/tools";
import { rows } from "../helpers/test-db";

/*
 * Spending paid in cash (issue #77). It came out of no bank or card account:
 * it counts in category and monthly spending like any expense, but never
 * changes an account balance, not even the main chequing account's (which an
 * expense with no account_id otherwise comes off).
 */

const A: McpCaller = { userId: "user_a", client: "Claude" };

const blank = {
  institution: null,
  creditLimitCents: null,
  availableCreditCents: null,
  statementBalanceCents: null,
  paymentDueDate: null,
  minimumPaymentCents: null,
  balanceSource: "manual",
};

const chequing = () =>
  insertAccount("user_a", {
    ...blank,
    type: "chequing",
    name: "Chequing",
    lastFour: "9876",
    balanceCents: 100_000,
  });

const visa = () =>
  insertAccount("user_a", {
    ...blank,
    type: "credit_card",
    name: "RBC Visa",
    institution: "RBC",
    lastFour: "1234",
    balanceCents: 30_000,
  });

/** Every balance entered on Oct 1, before the expenses below. */
const balancesOnOct1 = () =>
  rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");

const balanceOf = async (id: string) =>
  (await selectAccount("user_a", id))?.balanceCents;

const breakfast = (
  extra: Partial<ExpenseFormValues> = {},
): ExpenseFormValues => ({
  description: "Denny's",
  category: "Dining",
  amount: "23.71",
  spentOn: "2026-10-20",
  ...extra,
});

const stored = async () =>
  (await rows("select account_id, paid_cash from expenses")).map((r) => ({
    account_id: r.account_id,
    paid_cash: r.paid_cash,
  }));

const dennys = {
  amount: 23.71,
  date: "2026-10-20",
  merchant: "Denny's",
  category: "Dining",
  is_subscription: false,
};

/** Both accounts still hold what was entered on Oct 1. */
const untouched = async (cheq: string, card: string) => {
  expect(await balanceOf(cheq)).toBe(100_000);
  expect(await balanceOf(card)).toBe(30_000);
};

describe("a cash expense in the app", () => {
  it("is saved with no account and changes no balance", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    expect(await createExpense(breakfast({ accountId: CASH }))).toEqual({
      ok: true,
    });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    await untouched(cheq, card);
  });

  it("can be picked with a single account too", async () => {
    const cheq = await chequing();
    await balancesOnOct1();
    await createExpense(breakfast({ accountId: CASH }));
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    expect(await balanceOf(cheq)).toBe(100_000);
  });

  it("counts in category and monthly spending", async () => {
    await chequing();
    await visa();
    await createExpense(breakfast({ accountId: CASH }));
    const overview = await buildMonthOverview("user_a", "2026-10", 1);
    expect(overview.current.spentCents).toBe(2_371);
    expect(overview.expenses).toEqual([
      expect.objectContaining({ category: "Dining", amountCents: 2_371 }),
    ]);
  });

  it("moves between cash and an account when edited", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    await createExpense(breakfast({ accountId: cheq }));
    expect(await balanceOf(cheq)).toBe(97_629);
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    expect(await updateExpense(id, breakfast({ accountId: CASH }))).toEqual({
      ok: true,
    });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    await untouched(cheq, card);

    // Saving without picking keeps it cash.
    await updateExpense(id, breakfast({ amount: "25.00" }));
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);

    await updateExpense(id, breakfast({ accountId: card }));
    expect(await stored()).toEqual([{ account_id: card, paid_cash: false }]);
    expect(await balanceOf(card)).toBe(32_371);
  });

  it("is named Cash in the receipts export", async () => {
    await chequing();
    await visa();
    await createExpense(breakfast({ accountId: CASH }));
    const [row] = await selectExpenditures(
      "user_a",
      "2026-10-01",
      "2026-10-31",
    );
    expect(row).toMatchObject({ account: "Cash" });
  });
});

describe("add_expense with account_id cash", () => {
  it("saves without needs_account, and approving keeps it off every balance", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    const result = await addExpense(A, { ...dennys, account_id: CASH });
    expect(result.data).toMatchObject({
      status: "pending_review",
      account_id: CASH,
      account_name: "Cash",
    });
    expect(result.summary).toMatch(/Paid in cash/);

    const [item] = await getPendingExpenses();
    expect(item).toMatchObject({ accountId: CASH, accountName: "Cash" });

    expect(await approvePendingExpense(String(result.data.id))).toEqual({
      ok: true,
    });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    await untouched(cheq, card);
  });

  it("mentions cash when it has to ask for the account", async () => {
    await chequing();
    await visa();
    const result = await addExpense(A, dennys);
    expect(result.data.status).toBe("needs_account");
    expect(result.summary).toContain('account_id "cash"');
  });

  it("lets an item with no account be approved as cash after editing", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    const asked = await addExpense(A, { ...dennys, account_id: card });
    const id = String(asked.data.id);
    expect(
      await editPendingExpense(id, { ...breakfast(), accountId: CASH }),
    ).toEqual({ ok: true });
    expect(await approvePendingExpense(id)).toEqual({ ok: true });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    await untouched(cheq, card);
  });

  it("can take a receipt like any other expense", async () => {
    await chequing();
    await visa();
    await createExpense(breakfast({ accountId: CASH }));
    const [row] = await rows("select id from expenses");
    const attached = await attachReceipt(A, {
      expense_id: String(row?.id),
      merchant: "Denny's",
      total: 23.71,
      date: "2026-10-20",
    });
    expect(attached.data).toMatchObject({ status: "attached" });
    const [saved] = await rows(
      "select receipt_id, paid_cash from expenses where id = $1",
      [row?.id],
    );
    expect(saved?.receipt_id).not.toBeNull();
    expect(saved?.paid_cash).toBe(true);
  });
});

describe("list_expenses and edit_expense", () => {
  it("list a cash expense as Cash, and edit_expense moves one to cash", async () => {
    const cheq = await chequing();
    await visa();
    await createExpense(breakfast({ accountId: cheq }));
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    const moved = await editExpense(A, { id, account_id: CASH });
    expect(moved.data).toMatchObject({ account_id: CASH, account: "Cash" });
    expect(moved.summary).toMatch(/paid in cash/);

    const listed = await listExpenses(A, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(listed.data.expenses).toEqual([
      expect.objectContaining({ id, account_id: CASH, account: "Cash" }),
    ]);
  });
});
