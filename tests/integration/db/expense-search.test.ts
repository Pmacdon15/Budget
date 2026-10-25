import { describe, expect, it } from "vitest";
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
});
