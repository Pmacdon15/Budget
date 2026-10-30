import { describe, expect, it } from "vitest";
import { deleteAccount } from "@/actions/accounts";
import { createExpense, updateExpense } from "@/actions/expenses";
import {
  approvePendingExpense,
  editPendingExpense,
} from "@/actions/pending-expenses";
import { GET } from "@/app/api/expense-accounts/route";
import { getPendingExpenses } from "@/dal/pending-expenses";
import { insertAccount, selectAccount } from "@/db/accounts";
import { insertPendingExpense } from "@/db/pending-expenses";
import { ACCOUNT_REQUIRED_MESSAGE } from "@/lib/expense-accounts";
import type { ExpenseFormValues } from "@/lib/schemas";
import {
  addExpense,
  editExpense,
  listExpenses,
  type McpCaller,
} from "@/mcp/tools";
import { signOut } from "../helpers/auth";
import { rows } from "../helpers/test-db";

/*
 * Which account an expense came out of. With more than one account, the
 * expense form and the MCP server confirm the account before saving, and the
 * expense comes off that account: less in chequing, more owed on a credit
 * card. Expenses saved before accounts (no account) still come off the main
 * chequing account.
 */

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Gemini" };

const blank = {
  institution: null,
  creditLimitCents: null,
  availableCreditCents: null,
  statementBalanceCents: null,
  paymentDueDate: null,
  minimumPaymentCents: null,
  balanceSource: "manual",
};

/** The first chequing account is the main one. */
const chequing = (userId = "user_a") =>
  insertAccount(userId, {
    ...blank,
    type: "chequing",
    name: "Chequing",
    lastFour: "9876",
    balanceCents: 100_000,
  });

const visa = (userId = "user_a") =>
  insertAccount(userId, {
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

const balanceOf = async (id: string, userId = "user_a") =>
  (await selectAccount(userId, id))?.balanceCents;

const groceries = (
  extra: Partial<ExpenseFormValues> = {},
): ExpenseFormValues => ({
  description: "Costco run",
  category: "Groceries",
  amount: "100.00",
  spentOn: "2026-10-20",
  ...extra,
});

const expenseAccounts = async () =>
  (await rows("select account_id from expenses")).map((r) => r.account_id);

const shell = {
  amount: 45.67,
  date: "2026-10-20",
  merchant: "Shell",
  category: "Transportation",
  is_subscription: false,
};

describe("adding an expense in the app", () => {
  it("uses the only account without asking", async () => {
    const cheq = await chequing();
    await balancesOnOct1();
    expect(await createExpense(groceries())).toEqual({ ok: true });
    expect(await expenseAccounts()).toEqual([cheq]);
    expect(await balanceOf(cheq)).toBe(90_000);
  });

  it("refuses to guess with more than one account", async () => {
    await chequing();
    await visa();
    const result = await createExpense(groceries());
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { accountId: [ACCOUNT_REQUIRED_MESSAGE] },
    });
    expect(await rows("select * from expenses")).toEqual([]);
  });

  it("takes a card charge off the card, not chequing", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    expect(await createExpense(groceries({ accountId: card }))).toEqual({
      ok: true,
    });
    expect(await balanceOf(card)).toBe(40_000); // owes $100 more
    expect(await balanceOf(cheq)).toBe(100_000);
  });

  it("takes a chequing charge off chequing", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    await createExpense(groceries({ accountId: cheq }));
    expect(await balanceOf(cheq)).toBe(90_000);
    expect(await balanceOf(card)).toBe(30_000);
  });

  it("puts every part of a split on the chosen account", async () => {
    await chequing();
    const card = await visa();
    await createExpense(
      groceries({
        accountId: card,
        splits: JSON.stringify([
          { category: "Groceries", amount: "70.00" },
          { category: "Alcohol", amount: "30.00" },
        ]),
      }),
    );
    expect(await expenseAccounts()).toEqual([card, card]);
  });

  it("won't use another user's account", async () => {
    await chequing();
    await visa();
    const theirs = await visa("user_b");
    const result = await createExpense(groceries({ accountId: theirs }));
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.fieldErrors?.accountId?.[0]).toMatch(
      /no longer exists/,
    );
    expect(await rows("select * from expenses")).toEqual([]);
  });
});

describe("editing an expense in the app", () => {
  it("moves it to another account, and keeps it there when none is picked", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    await createExpense(groceries({ accountId: cheq }));
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    expect(await updateExpense(id, groceries({ accountId: card }))).toEqual({
      ok: true,
    });
    expect(await balanceOf(cheq)).toBe(100_000);
    expect(await balanceOf(card)).toBe(40_000);

    await updateExpense(id, groceries({ amount: "50.00" }));
    expect(await expenseAccounts()).toEqual([card]);
    expect(await balanceOf(card)).toBe(35_000);
  });
});

describe("balances", () => {
  it("still takes an expense with no account off the main chequing account", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    await rows(
      `insert into expenses (user_id, month, spent_on, description, category, amount_cents)
       values ('user_a', '2026-10', '2026-10-20', 'Old expense', 'Groceries', 2500)`,
    );
    expect(await balanceOf(cheq)).toBe(97_500);
    expect(await balanceOf(card)).toBe(30_000);
  });

  it("doesn't move a deleted card's expenses onto chequing", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    await createExpense(groceries({ accountId: card }));
    expect(await deleteAccount(card)).toMatchObject({ ok: true });
    expect(await balanceOf(cheq)).toBe(100_000);
  });
});

describe("add_expense from an AI", () => {
  it("asks which account paid when there's more than one, saving nothing", async () => {
    const cheq = await chequing();
    const card = await visa();
    const result = await addExpense(A, shell);
    expect(result.isError).toBeUndefined();
    expect(result.data.status).toBe("needs_account");
    expect(result.summary).toMatch(/Nothing was saved/);
    expect(result.summary).toMatch(/Ask the user/);
    expect(result.data.accounts).toEqual([
      expect.objectContaining({ id: cheq, name: "Chequing", is_primary: true }),
      expect.objectContaining({
        id: card,
        name: "RBC Visa",
        type: "credit_card",
        last_four: "1234",
      }),
    ]);
    expect(await rows("select * from pending_expenses")).toEqual([]);
  });

  it("sends the confirmed account with the item, and approving uses it", async () => {
    const cheq = await chequing();
    const card = await visa();
    await balancesOnOct1();
    const result = await addExpense(A, { ...shell, account_id: card });
    expect(result.data).toMatchObject({
      status: "pending_review",
      account_id: card,
      account_name: "RBC Visa",
    });
    expect(result.summary).toMatch(/Paid from RBC Visa \(Credit card\)/);

    const [item] = await getPendingExpenses();
    expect(item).toMatchObject({ accountId: card, accountName: "RBC Visa" });

    expect(await approvePendingExpense(String(result.data.id))).toEqual({
      ok: true,
    });
    expect(await expenseAccounts()).toEqual([card]);
    expect(await balanceOf(card)).toBe(34_567);
    expect(await balanceOf(cheq)).toBe(100_000);
  });

  it("uses the only account without asking", async () => {
    const cheq = await chequing();
    const result = await addExpense(A, shell);
    expect(result.data).toMatchObject({
      status: "pending_review",
      account_id: cheq,
    });
  });

  it("works as before with no accounts at all", async () => {
    const result = await addExpense(A, shell);
    expect(result.data).toMatchObject({
      status: "pending_review",
      account_id: null,
    });
  });

  it("rejects an account that isn't the caller's", async () => {
    await chequing();
    const theirs = await visa("user_b");
    const result = await addExpense(A, { ...shell, account_id: theirs });
    expect(result.isError).toBe(true);
    expect(result.data.status).toBe("unknown_account");
    expect(await rows("select * from pending_expenses")).toEqual([]);
  });

  it("asks about a duplicate before the account", async () => {
    await chequing();
    const card = await visa();
    await addExpense(A, { ...shell, account_id: card });
    const again = await addExpense(A, shell);
    expect(again.data.status).toBe("possible_duplicate");
  });
});

describe("approving an item with no account", () => {
  const legacyItem = () =>
    insertPendingExpense("user_a", {
      spentOn: "2026-10-20",
      description: "Shell",
      merchant: "Shell",
      category: "Transportation",
      amountCents: 4_567,
      source: null,
      client: "Claude",
    });

  it("waits for the user to choose when there's more than one account", async () => {
    await chequing();
    const card = await visa();
    const id = await legacyItem();

    const refused = await approvePendingExpense(id);
    expect(refused).toMatchObject({ ok: false });
    expect(refused.ok ? "" : refused.error).toMatch(/choose the account/i);
    expect(await rows("select * from expenses")).toEqual([]);
    expect(await getPendingExpenses()).toHaveLength(1);

    expect(
      await editPendingExpense(id, {
        description: "Shell",
        category: "Transportation",
        amount: "45.67",
        spentOn: "2026-10-20",
        accountId: card,
      }),
    ).toEqual({ ok: true });
    expect(await approvePendingExpense(id)).toEqual({ ok: true });
    expect(await expenseAccounts()).toEqual([card]);
  });

  it("uses the only account", async () => {
    const cheq = await chequing();
    const id = await legacyItem();
    expect(await approvePendingExpense(id)).toEqual({ ok: true });
    expect(await expenseAccounts()).toEqual([cheq]);
  });
});

describe("list_expenses and edit_expense", () => {
  it("say which account each expense came out of", async () => {
    const cheq = await chequing();
    const card = await visa();
    await createExpense(groceries({ accountId: card }));
    await rows(
      `insert into expenses (user_id, month, spent_on, description, category, amount_cents)
       values ('user_a', '2026-10', '2026-10-21', 'Old expense', 'Groceries', 2500)`,
    );
    const result = await listExpenses(A, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(result.data.expenses).toEqual([
      expect.objectContaining({
        description: "Old expense",
        account_id: cheq,
        account: "Chequing",
      }),
      expect.objectContaining({
        description: "Costco run",
        account_id: card,
        account: "RBC Visa",
      }),
    ]);
  });

  it("moves an expense to the account the user says paid", async () => {
    const cheq = await chequing();
    const card = await visa();
    await createExpense(groceries({ accountId: cheq }));
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    const moved = await editExpense(A, { id, account_id: card });
    expect(moved.data).toMatchObject({ account_id: card, account: "RBC Visa" });
    expect(await expenseAccounts()).toEqual([card]);

    const theirs = await visa("user_b");
    const refused = await editExpense(A, { id, account_id: theirs });
    expect(refused.isError).toBe(true);
    expect(refused.summary).toMatch(/edit_expense/);
    expect(await expenseAccounts()).toEqual([card]);
    // Another user can't move it either.
    expect((await editExpense(B, { id, account_id: theirs })).isError).toBe(
      true,
    );
  });
});

describe("GET /api/expense-accounts", () => {
  it("lists only the signed-in user's accounts, uncached", async () => {
    const cheq = await chequing();
    const card = await visa();
    await visa("user_b");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      accounts: [
        {
          id: cheq,
          name: "Chequing",
          type: "chequing",
          institution: null,
          lastFour: "9876",
          isPrimary: true,
        },
        {
          id: card,
          name: "RBC Visa",
          type: "credit_card",
          institution: "RBC",
          lastFour: "1234",
          isPrimary: false,
        },
      ],
    });
  });

  it("refuses signed-out callers with JSON", async () => {
    signOut();
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Sign in to see your accounts.",
    });
  });
});
