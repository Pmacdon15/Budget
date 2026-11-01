import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  type ExpenseFilters,
  likePattern,
  selectMatchingExpenses,
} from "@/db/expense-search";
import { insertExpense, insertExpenseLines } from "@/db/expenses";

const NONE: ExpenseFilters = {
  month: "2026-10",
  text: null,
  category: null,
  minCents: null,
  maxCents: null,
  limit: 200,
};

const expense = (
  overrides: Partial<Parameters<typeof insertExpense>[1]> = {},
) => ({
  month: "2026-10",
  spentOn: "2026-10-05",
  description: "Costco run",
  category: "Groceries",
  amountCents: 12_000,
  ...overrides,
});

async function seed(userId = "user_a") {
  await insertExpense(userId, expense());
  await insertExpense(
    userId,
    expense({
      spentOn: "2026-10-09",
      description: "Pizza night",
      category: "Dining",
      amountCents: 3_500,
    }),
  );
  await insertExpense(
    userId,
    expense({
      month: "2026-08",
      spentOn: "2026-08-20",
      description: "Gas",
      category: "Transportation",
      amountCents: 6_000,
    }),
  );
  // Described one way, bought from a merchant the person may search for instead.
  await insertExpenseLines(
    userId,
    { month: "2026-10", spentOn: "2026-10-12", description: "Weekly shop" },
    [{ category: "Groceries", amountCents: 8_000 }],
    {
      imagePathname: `receipts/${userId}/shop.jpg`,
      merchant: "Save-On-Foods",
      purchasedOn: "2026-10-12",
      subtotalCents: null,
      taxCents: null,
      totalCents: 8_000,
      rawText: null,
    },
  );
}

const names = async (userId: string, filters: Partial<ExpenseFilters>) =>
  (await selectMatchingExpenses(userId, { ...NONE, ...filters })).map(
    (e) => e.description,
  );

describe("db/expense-search", () => {
  it("lists the month's expenses newest first when nothing is filtered", async () => {
    await seed();
    expect(await names("user_a", {})).toEqual([
      "Weekly shop",
      "Pizza night",
      "Costco run",
    ]);
  });

  it("matches description or merchant, ignoring case", async () => {
    await seed();
    expect(await names("user_a", { text: "COSTCO" })).toEqual(["Costco run"]);
    expect(await names("user_a", { text: "save-on" })).toEqual(["Weekly shop"]);
  });

  it("filters by category and amount range, inclusive", async () => {
    await seed();
    expect(await names("user_a", { category: "Groceries" })).toEqual([
      "Weekly shop",
      "Costco run",
    ]);
    expect(await names("user_a", { minCents: 3_500, maxCents: 8_000 })).toEqual(
      ["Weekly shop", "Pizza night"],
    );
  });

  it("searches every month when no month is given", async () => {
    await seed();
    expect(await names("user_a", { month: null, text: "gas" })).toEqual([
      "Gas",
    ]);
    expect(await names("user_a", { text: "gas" })).toEqual([]);
  });

  it("never returns another user's expenses", async () => {
    await seed("user_b");
    expect(await names("user_a", { month: null })).toEqual([]);
  });

  it("treats % and _ in the search text literally", async () => {
    await insertExpense("user_a", expense({ description: "50% off sale" }));
    await insertExpense("user_a", expense({ description: "500 off" }));
    expect(await names("user_a", { text: "0%" })).toEqual(["50% off sale"]);
    expect(await names("user_a", { text: "_" })).toEqual([]);
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("stops at the limit", async () => {
    await seed();
    expect(await names("user_a", { month: null, limit: 2 })).toHaveLength(2);
  });

  it("includes photo receipt details and kind on matched expenses", async () => {
    await seed();
    const matches = await selectMatchingExpenses("user_a", {
      ...NONE,
      text: "Weekly shop",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.receiptId).toBeTruthy();
    expect(matches[0]?.receiptHasPhoto).toBe(true);
    expect(matches[0]?.receiptKind).toBe("photo");
  });

  it("shows receipt photo even when receipt row user_id differs", async () => {
    await db()`
      with r as (
        insert into receipts (user_id, image_pathname, merchant)
        values ('other_user', 'receipts/other_user/marks.jpg', 'Marks')
        returning id
      )
      insert into expenses (user_id, month, spent_on, description, category, amount_cents, receipt_id)
      select 'user_a', '2026-09', '2026-09-13', 'Marks work clothes', 'Professional', 4934, r.id
      from r
    `;

    const matches = await selectMatchingExpenses("user_a", {
      ...NONE,
      month: null,
      text: "marks",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.description).toBe("Marks work clothes");
    expect(matches[0]?.receiptHasPhoto).toBe(true);
    expect(matches[0]?.receiptKind).toBe("photo");
  });
});
