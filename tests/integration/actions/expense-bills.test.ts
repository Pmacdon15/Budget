import { describe, expect, it } from "vitest";
import { setBankBalance } from "@/actions/bank-balance";
import {
  convertSubscriptions,
  makeExpenseFixedBill,
} from "@/actions/expense-bills";
import { createExpense } from "@/actions/expenses";
import { createFixedItem } from "@/actions/fixed-items";
import { GET } from "@/app/api/subscription-candidates/route";
import { getBankBalance } from "@/dal/bank-balance";
import { getPaidBillIds } from "@/dal/bill-payments";
import { getFixedItems } from "@/dal/fixed-items";
import { getMonthOverview } from "@/dal/overview";
import type { Category } from "@/lib/categories";
import type { MakeFixedBillFormValues } from "@/lib/schemas/expense-bills";
import type { SubscriptionCandidate } from "@/lib/subscription-candidates";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

/*
 * Turning saved expenses into fixed bills from the Spending page: one at a
 * time from a row's menu, or several found by "Find subscriptions". The
 * expense always becomes its month's payment of the bill, so it's counted
 * once: as the bill, not also as spending or a second bank debit.
 */

const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

async function addExpense(
  description: string,
  spentOn: string,
  amount: string,
  category: Category = "Entertainment",
) {
  expect(
    await createExpense({ description, category, amount, spentOn }),
  ).toEqual({ ok: true });
  const [row] = await rows(
    "select id from expenses where description = $1 and spent_on = $2",
    [description, spentOn],
  );
  return String(row?.id);
}

async function addBill(name: string, amount: string, month = "2026-01") {
  expect(
    await createFixedItem({
      name,
      category: "Subscriptions",
      amount,
      dueDay: "5",
      month,
    }),
  ).toEqual({ ok: true });
  const bill = (await getFixedItems()).find((b) => b.name === name);
  if (!bill) throw new Error(`${name} was not created`);
  return bill;
}

const linkOf = async (expenseId: string) => {
  const [row] = await rows("select fixed_item_id from expenses where id = $1", [
    expenseId,
  ]);
  return row?.fixed_item_id ?? null;
};

const billRows = () =>
  rows(
    "select name, category, amount_cents, due_day, start_month, end_month, match_keywords from fixed_items order by start_month",
  );

describe("make one expense a fixed bill", () => {
  it("adds a monthly bill pre-filled from the expense, paid by it", async () => {
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    expect(
      await makeExpenseFixedBill({
        mode: "new",
        expenseId: id,
        name: "Netflix Standard",
        category: "Subscriptions",
        dueDay: "5",
        matchKeywords: "Netflix, Netflix.com",
      }),
    ).toEqual({ ok: true });

    expect(await billRows()).toEqual([
      {
        name: "Netflix Standard",
        category: "Subscriptions",
        amount_cents: 1_699,
        due_day: 5,
        start_month: "2026-10",
        end_month: null,
        match_keywords: ["Netflix", "Netflix.com"],
      },
    ]);
    const [bill] = await getFixedItems();
    expect(await linkOf(id)).toBe(bill?.id);
    expect([...(await getPaidBillIds("2026-10"))]).toEqual([bill?.id]);
  });

  it("counts it once: as the bill, not also as spending", async () => {
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    const before = (await getMonthOverview("2026-10", 1)).current;
    await makeExpenseFixedBill({
      mode: "new",
      expenseId: id,
      name: "Netflix",
      category: "Subscriptions",
    });
    const after = await getMonthOverview("2026-10", 1);
    expect(after.expenses).toEqual([]);
    expect(after.current.variableCents).toBe(before.variableCents - 1_699);
    expect(after.current.fixedCents).toBe(before.fixedCents + 1_699);
    expect(after.current.netCents).toBe(before.netCents);
  });

  it("doesn't take it off the bank balance a second time", async () => {
    await setBankBalance({ balance: "1000" });
    await rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    const before = await getBankBalance();
    expect(before?.balanceCents).toBe(98_301);
    await makeExpenseFixedBill({
      mode: "new",
      expenseId: id,
      name: "Netflix",
      category: "Subscriptions",
    });
    expect((await getBankBalance())?.balanceCents).toBe(98_301);
  });

  it("can instead pay a bill the user already has, updating its amount", async () => {
    const netflix = await addBill("Netflix", "15.99");
    const id = await addExpense("Netflix.com", "2026-10-05", "16.99");
    expect(
      await makeExpenseFixedBill({
        mode: "existing",
        expenseId: id,
        fixedItemId: netflix.id,
        updateAmount: "on",
      }),
    ).toEqual({ ok: true });

    // No second bill: the old amount runs to September, the new one from October.
    expect(
      (await billRows()).map((b) => [
        b.amount_cents,
        b.start_month,
        b.end_month,
      ]),
    ).toEqual([
      [1_599, "2026-01", "2026-09"],
      [1_699, "2026-10", null],
    ]);
    const current = (await getFixedItems()).find((b) => b.endMonth === null);
    expect(await linkOf(id)).toBe(current?.id);
    expect([...(await getPaidBillIds("2026-10"))]).toEqual([current?.id]);
  });

  it("pays a bill without changing its amount when not asked to", async () => {
    const netflix = await addBill("Netflix", "15.99");
    const id = await addExpense("Netflix.com", "2026-10-05", "16.99");
    await makeExpenseFixedBill({
      mode: "existing",
      expenseId: id,
      fixedItemId: netflix.id,
    });
    expect((await billRows()).map((b) => b.amount_cents)).toEqual([1_599]);
    expect(await linkOf(id)).toBe(netflix.id);
  });

  it("won't pay a month another expense already paid", async () => {
    const netflix = await addBill("Netflix", "15.99");
    const first = await addExpense("Netflix", "2026-10-05", "15.99");
    const second = await addExpense("Netflix", "2026-10-20", "15.99");
    await makeExpenseFixedBill({
      mode: "existing",
      expenseId: first,
      fixedItemId: netflix.id,
    });
    expect(
      await makeExpenseFixedBill({
        mode: "existing",
        expenseId: second,
        fixedItemId: netflix.id,
      }),
    ).toEqual({
      ok: false,
      error: "Netflix is already paid for 2026-10 by another expense.",
    });
    expect(await linkOf(second)).toBeNull();
  });

  it("won't pay a bill in a month it doesn't run", async () => {
    const netflix = await addBill("Netflix", "15.99", "2026-11");
    const id = await addExpense("Netflix", "2026-10-05", "15.99");
    expect(
      await makeExpenseFixedBill({
        mode: "existing",
        expenseId: id,
        fixedItemId: netflix.id,
      }),
    ).toMatchObject({ ok: false });
    expect(await linkOf(id)).toBeNull();
  });

  it("refuses an expense that's already a bill's payment", async () => {
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    const values: MakeFixedBillFormValues = {
      mode: "new",
      expenseId: id,
      name: "Netflix",
      category: "Subscriptions",
    };
    await makeExpenseFixedBill(values);
    expect(await makeExpenseFixedBill(values)).toEqual({
      ok: false,
      error: "“Netflix” is already a fixed bill's payment.",
    });
    expect(await billRows()).toHaveLength(1);
  });

  it("refuses an expense that isn't paid yet", async () => {
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    await rows("update expenses set unpaid = true where id = $1", [id]);
    expect(
      await makeExpenseFixedBill({
        mode: "new",
        expenseId: id,
        name: "Netflix",
        category: "Subscriptions",
      }),
    ).toMatchObject({ ok: false });
    expect(await billRows()).toEqual([]);
  });

  it("validates the form", async () => {
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    expect(
      await makeExpenseFixedBill({
        mode: "new",
        expenseId: id,
        name: " ",
        category: "Subscriptions",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array) } });
    expect(
      await makeExpenseFixedBill({
        mode: "new",
        expenseId: MISSING_ID,
        name: "Netflix",
        category: "Subscriptions",
      }),
    ).toEqual({ ok: false, error: "That expense no longer exists." });
  });

  it("only converts the signed-in user's expenses", async () => {
    const id = await addExpense("Netflix", "2026-10-05", "16.99");
    signInAs("user_b");
    expect(
      await makeExpenseFixedBill({
        mode: "new",
        expenseId: id,
        name: "Mine now",
        category: "Subscriptions",
      }),
    ).toMatchObject({ ok: false });
    signOut();
    expect(
      await makeExpenseFixedBill({
        mode: "new",
        expenseId: id,
        name: "Netflix",
        category: "Subscriptions",
      }),
    ).toMatchObject({ ok: false });
    expect(await billRows()).toEqual([]);
  });
});

describe("find subscriptions", () => {
  const candidates = async (month = "2026-10") => {
    const response = await GET(
      new Request(
        `https://budget.test/api/subscription-candidates?month=${month}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    return body.candidates as SubscriptionCandidate[];
  };

  it("lists subscriptions and recurring charges, but not usage or shopping", async () => {
    await addExpense("Spotify", "2026-09-12", "11.99");
    await addExpense("Spotify", "2026-10-12", "11.99");
    await addExpense("Costco membership", "2026-08-02", "65.00", "Personal");
    await addExpense(
      "OpenAI API credits",
      "2026-10-01",
      "20.00",
      "Subscriptions",
    );
    await addExpense("Superstore", "2026-10-03", "84.12", "Groceries");

    const found = await candidates();
    expect(found.map((c) => [c.name, c.expenses.length, c.reasons])).toEqual([
      ["Spotify", 2, ["keyword", "recurring"]],
      ["Costco membership", 1, ["keyword"]],
    ]);
  });

  it("leaves out expenses already paying a bill, and other users'", async () => {
    const id = await addExpense("Spotify", "2026-10-12", "11.99");
    await makeExpenseFixedBill({
      mode: "new",
      expenseId: id,
      name: "Spotify",
      category: "Subscriptions",
    });
    signInAs("user_b");
    await addExpense("Netflix", "2026-10-05", "16.99");
    signInAs("user_a");
    expect(await candidates()).toEqual([]);
  });

  it("only looks back six months", async () => {
    await addExpense("Netflix", "2026-04-05", "16.99");
    expect(await candidates()).toEqual([]);
    expect(await candidates("2026-09")).toHaveLength(1);
  });

  it("answers 401 when signed out", async () => {
    signOut();
    const response = await GET(
      new Request("https://budget.test/api/subscription-candidates"),
    );
    expect(response.status).toBe(401);
  });

  it("makes one bill from months of charges, each its month's payment", async () => {
    const aug = await addExpense("Rogers", "2026-08-03", "80.00", "Utilities");
    const sep = await addExpense("Rogers", "2026-09-03", "85.00", "Utilities");
    const oct = await addExpense("Rogers", "2026-10-03", "85.00", "Utilities");
    const before = (await getMonthOverview("2026-10", 3)).history;

    expect(
      await convertSubscriptions({
        items: [
          {
            expenseIds: [oct, aug, sep],
            name: "Phone",
            category: "Utilities",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      converted: { created: 1, payments: 3, skipped: 0 },
    });

    // One bill (two rows: the price went up in September), due on the 3rd.
    expect(
      (await billRows()).map((b) => [
        b.name,
        b.amount_cents,
        b.due_day,
        b.start_month,
        b.end_month,
      ]),
    ).toEqual([
      ["Phone", 8_000, 3, "2026-08", "2026-08"],
      ["Phone", 8_500, 3, "2026-09", null],
    ]);
    for (const [id, month] of [
      [aug, "2026-08"],
      [sep, "2026-09"],
      [oct, "2026-10"],
    ] as const) {
      const paid = [...(await getPaidBillIds(month))];
      expect(paid).toHaveLength(1);
      expect(await linkOf(id)).toBe(paid[0]);
    }

    // Each month moved from spending to the bill: nothing counted twice.
    const after = (await getMonthOverview("2026-10", 3)).history;
    after.forEach((month, i) => {
      expect(month.netCents).toBe(before[i]?.netCents);
      expect(month.variableCents).toBe(0);
    });
  });

  it("can pay a bill the user already has instead of adding one", async () => {
    const netflix = await addBill("Netflix", "15.99");
    const sep = await addExpense("Netflix.com", "2026-09-05", "16.99");
    const oct = await addExpense("Netflix.com", "2026-10-05", "16.99");
    expect(
      await convertSubscriptions({
        items: [
          {
            expenseIds: [sep, oct],
            name: "Netflix.com",
            category: "Entertainment",
            fixedItemId: netflix.id,
            updateAmount: true,
          },
        ],
      }),
    ).toEqual({
      ok: true,
      converted: { created: 0, payments: 2, skipped: 0 },
    });
    expect(
      (await billRows()).map((b) => [b.name, b.amount_cents, b.end_month]),
    ).toEqual([
      ["Netflix", 1_599, "2026-08"],
      ["Netflix", 1_699, null],
    ]);
  });

  it("leaves a charge as an expense when its month is already paid", async () => {
    const netflix = await addBill("Netflix", "16.99");
    const oct = await addExpense("Netflix", "2026-10-05", "16.99");
    const other = await addExpense("Netflix again", "2026-10-06", "16.99");
    await makeExpenseFixedBill({
      mode: "existing",
      expenseId: other,
      fixedItemId: netflix.id,
    });
    expect(
      await convertSubscriptions({
        items: [
          {
            expenseIds: [oct],
            name: "Netflix",
            category: "Subscriptions",
            fixedItemId: netflix.id,
          },
        ],
      }),
    ).toEqual({
      ok: true,
      converted: { created: 0, payments: 0, skipped: 1 },
    });
    expect(await linkOf(oct)).toBeNull();
  });

  it("checks every pick before saving anything", async () => {
    const a = await addExpense("Spotify", "2026-10-12", "11.99");
    const b = await addExpense("Spotify", "2026-10-20", "11.99");
    const c = await addExpense("Netflix", "2026-10-05", "16.99");
    // Two charges in one month can't both pay a monthly bill.
    expect(
      await convertSubscriptions({
        items: [
          { expenseIds: [c], name: "Netflix", category: "Subscriptions" },
          { expenseIds: [a, b], name: "Spotify", category: "Subscriptions" },
        ],
      }),
    ).toMatchObject({ ok: false });
    // One expense can't become two bills.
    expect(
      await convertSubscriptions({
        items: [
          { expenseIds: [c], name: "Netflix", category: "Subscriptions" },
          { expenseIds: [c], name: "Again", category: "Subscriptions" },
        ],
      }),
    ).toEqual({ ok: false, error: "An expense can only become one bill." });
    // Someone else's expense.
    signInAs("user_b");
    const theirs = await addExpense("Crave", "2026-10-05", "9.99");
    signInAs("user_a");
    expect(
      await convertSubscriptions({
        items: [
          { expenseIds: [c], name: "Netflix", category: "Subscriptions" },
          { expenseIds: [theirs], name: "Crave", category: "Subscriptions" },
        ],
      }),
    ).toMatchObject({ ok: false });
    expect(await billRows()).toEqual([]);
    expect(await linkOf(c)).toBeNull();
  });

  it("needs at least one pick", async () => {
    expect(await convertSubscriptions({ items: [] })).toMatchObject({
      ok: false,
      error: "Pick at least one subscription",
    });
  });
});
