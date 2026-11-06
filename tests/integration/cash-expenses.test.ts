import { describe, expect, it } from "vitest";
import { createExpense, updateExpense } from "@/actions/expenses";
import {
  approvePendingExpense,
  editPendingExpense,
} from "@/actions/pending-expenses";
import { getMonthOverview } from "@/dal/overview";
import { getPendingExpenses } from "@/dal/pending-expenses";
import { insertAccount, selectAccount } from "@/db/accounts";
import { insertPendingExpense } from "@/db/pending-expenses";
import { selectExpenditures } from "@/db/receipt-export";
import { CASH_ACCOUNT_ID } from "@/lib/expense-accounts";
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
 * Cash spending (issue 77): an expense paid in cash counts toward category
 * and monthly spending and keeps its receipt, but never comes off any
 * account's balance, not even the primary chequing account that an expense
 * with no account otherwise means.
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

const balancesOnOct1 = () =>
  rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");

const balanceOf = async (id: string) =>
  (await selectAccount("user_a", id))?.balanceCents;

const stored = () =>
  rows("select account_id, paid_cash from expenses order by created_at");

const breakfast = (
  extra: Partial<ExpenseFormValues> = {},
): ExpenseFormValues => ({
  description: "Denny's",
  category: "Dining",
  amount: "23.71",
  spentOn: "2026-10-20",
  ...extra,
});

const dennys = {
  amount: 23.71,
  date: "2026-10-20",
  merchant: "Denny's",
  category: "Dining",
  is_subscription: false,
};

describe("a cash expense in the app", () => {
  it("saves with several accounts, counts as spending and comes off no balance", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();

    expect(
      await createExpense(breakfast({ accountId: CASH_ACCOUNT_ID })),
    ).toEqual({ ok: true });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    expect(await balanceOf(cheq)).toBe(100_000);
    expect(await balanceOf(card)).toBe(30_000);

    const overview = await getMonthOverview("2026-10");
    expect(overview.current.variableCents).toBe(2_371);
    expect(overview.categories).toEqual([
      expect.objectContaining({ category: "Dining", totalCents: 2_371 }),
    ]);
    expect(overview.expenses).toEqual([
      expect.objectContaining({ accountId: CASH_ACCOUNT_ID }),
    ]);
  });

  it("is offered with a single account too", async () => {
    const cheq = await chequing();
    await balancesOnOct1();
    await createExpense(breakfast({ accountId: CASH_ACCOUNT_ID }));
    expect(await balanceOf(cheq)).toBe(100_000);
  });

  it("moves between cash and an account when edited", async () => {
    const cheq = await chequing();
    await visa();
    await balancesOnOct1();
    await createExpense(breakfast({ accountId: cheq }));
    expect(await balanceOf(cheq)).toBe(97_629);
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    await updateExpense(id, breakfast({ accountId: CASH_ACCOUNT_ID }));
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    expect(await balanceOf(cheq)).toBe(100_000);

    // None picked keeps it cash.
    await updateExpense(id, breakfast({ amount: "25.00" }));
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);

    await updateExpense(id, breakfast({ accountId: cheq }));
    expect(await stored()).toEqual([{ account_id: cheq, paid_cash: false }]);
    expect(await balanceOf(cheq)).toBe(97_629);
  });

  it("is listed as Cash in the receipt download", async () => {
    await chequing();
    await visa();
    await createExpense(breakfast({ accountId: CASH_ACCOUNT_ID }));
    const [row] = await selectExpenditures(
      "user_a",
      "2026-10-01",
      "2026-10-31",
    );
    expect(row).toMatchObject({ description: "Denny's", account: "Cash" });
  });
});

describe("a cash expense from an AI", () => {
  it("needs no account, and approving it keeps it off every balance", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();

    const result = await addExpense(A, { ...dennys, paid_cash: true });
    expect(result.data).toMatchObject({
      status: "pending_review",
      account_id: null,
      account_name: "Cash",
      paid_cash: true,
    });
    expect(result.summary).toMatch(/Paid in cash/);

    const [item] = await getPendingExpenses();
    expect(item).toMatchObject({
      accountId: CASH_ACCOUNT_ID,
      accountName: "Cash",
    });

    expect(await approvePendingExpense(String(result.data.id))).toEqual({
      ok: true,
    });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    expect(await balanceOf(cheq)).toBe(100_000);
    expect(await balanceOf(card)).toBe(30_000);
  });

  it("still asks without paid_cash, and offers cash", async () => {
    await chequing();
    await visa();
    const result = await addExpense(A, dennys);
    expect(result.data.status).toBe("needs_account");
    expect(result.summary).toMatch(/paid_cash: true/);
  });

  it("lists, edits and attaches receipts to cash expenses", async () => {
    const cheq = await chequing();
    await visa();
    await createExpense(breakfast({ accountId: cheq }));
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    const moved = await editExpense(A, { id, paid_cash: true });
    expect(moved.data).toMatchObject({ account: "Cash", paid_cash: true });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);

    const listed = await listExpenses(A, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(listed.data.expenses).toEqual([
      expect.objectContaining({
        id,
        account_id: null,
        account: "Cash",
        paid_cash: true,
      }),
    ]);

    const attached = await attachReceipt(A, {
      expense_id: id,
      merchant: "Denny's",
      total: 23.71,
      text: "2 Grand Slams",
    });
    expect(attached.isError).toBeUndefined();
    expect(await rows("select raw_text from receipts")).toEqual([
      { raw_text: "2 Grand Slams" },
    ]);

    // Off cash with several accounts: the account must be named.
    const refused = await editExpense(A, { id, paid_cash: false });
    expect(refused.data.status).toBe("needs_account");
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    const back = await editExpense(A, {
      id,
      paid_cash: false,
      account_id: cheq,
    });
    expect(back.data).toMatchObject({ account_id: cheq, paid_cash: false });
    expect(await stored()).toEqual([{ account_id: cheq, paid_cash: false }]);
  });
});

describe("a cash item on Review", () => {
  it("can be switched to cash and approved without an account", async () => {
    const cheq = await chequing();
    await visa();
    await balancesOnOct1();
    const id = await insertPendingExpense("user_a", {
      spentOn: "2026-10-20",
      description: "Denny's",
      merchant: "Denny's",
      category: "Dining",
      amountCents: 2_371,
      source: null,
      client: "Claude",
    });
    expect(
      await editPendingExpense(id, {
        description: "Denny's",
        category: "Dining",
        amount: "23.71",
        spentOn: "2026-10-20",
        accountId: CASH_ACCOUNT_ID,
      }),
    ).toEqual({ ok: true });
    expect(await approvePendingExpense(id)).toEqual({ ok: true });
    expect(await stored()).toEqual([{ account_id: null, paid_cash: true }]);
    expect(await balanceOf(cheq)).toBe(100_000);
  });
});
