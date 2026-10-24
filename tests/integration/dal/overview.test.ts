import { describe, expect, it } from "vitest";
import { getLatestIncome } from "@/dal/income";
import { getMonthOverview } from "@/dal/overview";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertIncome } from "@/db/income";

const pay = (month: string, amountCents: number, userId = "user_a") =>
  insertIncome(userId, {
    month,
    label: "Paycheque",
    amountCents,
    receivedOn: null,
  });

const spend = (
  spentOn: string,
  amountCents: number,
  category = "Groceries",
  userId = "user_a",
) =>
  insertExpense(userId, {
    month: spentOn.slice(0, 7),
    spentOn,
    description: `${category} ${spentOn}`,
    category,
    amountCents,
  });

describe("getMonthOverview", () => {
  it("is empty for a new user", async () => {
    const overview = await getMonthOverview("2026-10");
    expect(overview.history).toHaveLength(12);
    expect(overview.history[0]?.month).toBe("2025-11");
    expect(overview.current).toMatchObject({ month: "2026-10", netCents: 0 });
    expect(overview.previous.month).toBe("2026-09");
    expect(overview.rollingIncomeCents).toBe(0);
    expect(overview.categories).toEqual([]);
    expect(overview.fixedItems).toEqual([]);
    expect(overview.income).toEqual([]);
    expect(overview.expenses).toEqual([]);
  });

  it("totals the month and lists its items", async () => {
    await insertFixedItem("user_a", {
      name: "Rent",
      category: "Housing",
      amountCents: 150_000,
      dueDay: 1,
      startMonth: "2026-01",
    });
    await insertFixedItem("user_a", {
      name: "Ended",
      category: "Debt",
      amountCents: 9_999,
      dueDay: null,
      startMonth: "2026-01",
      endMonth: "2026-08",
    });
    await pay("2026-10", 300_000);
    await spend("2026-10-03", 20_000);
    await spend("2026-10-10", 5_000, "Dining");
    await spend("2026-09-30", 1_000);

    const overview = await getMonthOverview("2026-10");
    expect(overview.current).toEqual({
      month: "2026-10",
      incomeCents: 300_000,
      fixedCents: 150_000,
      variableCents: 25_000,
      spentCents: 175_000,
      netCents: 125_000,
    });
    expect(overview.previous).toMatchObject({
      month: "2026-09",
      fixedCents: 159_999,
      variableCents: 1_000,
    });
    expect(overview.fixedItems.map((f) => f.name)).toEqual(["Rent"]);
    expect(overview.income).toHaveLength(1);
    expect(overview.expenses.map((e) => e.spentOn)).toEqual([
      "2026-10-10",
      "2026-10-03",
    ]);
    expect(overview.categories.map((c) => [c.category, c.totalCents])).toEqual([
      ["Housing", 150_000],
      ["Groceries", 20_000],
      ["Dining", 5_000],
    ]);
  });

  it("averages take-home over the last three months that have any", async () => {
    await pay("2026-03", 100_000);
    await pay("2026-06", 200_000);
    await pay("2026-08", 300_000);
    await pay("2026-08", 100_000);
    await pay("2026-10", 250_000);
    // (200k + 400k + 250k) / 3, rounded to the cent
    expect((await getMonthOverview("2026-10")).rollingIncomeCents).toBe(
      283_333,
    );
  });

  it("averages fewer months when that's all there is", async () => {
    await pay("2026-09", 100_000);
    expect((await getMonthOverview("2026-10")).rollingIncomeCents).toBe(
      100_000,
    );
  });

  it("only looks back as far as asked", async () => {
    await pay("2026-08", 999_999);
    await pay("2026-10", 100_000);
    const overview = await getMonthOverview("2026-10", 2);
    expect(overview.history.map((h) => h.month)).toEqual(["2026-09", "2026-10"]);
    expect(overview.rollingIncomeCents).toBe(100_000);
  });

  it("compares a one-month window against an empty previous month", async () => {
    await pay("2026-09", 123);
    const overview = await getMonthOverview("2026-10", 1);
    expect(overview.history).toHaveLength(1);
    expect(overview.previous).toMatchObject({
      month: "2026-09",
      incomeCents: 0,
    });
  });

  it("ignores other users' data", async () => {
    await pay("2026-10", 500_000, "user_b");
    await spend("2026-10-01", 500, "Groceries", "user_b");
    const overview = await getMonthOverview("2026-10");
    expect(overview.current.incomeCents).toBe(0);
    expect(overview.expenses).toEqual([]);
  });
});

describe("getLatestIncome", () => {
  it("returns the most recent paycheque, or null", async () => {
    expect(await getLatestIncome()).toBeNull();
    await pay("2026-09", 1);
    await pay("2026-10", 2);
    expect(await getLatestIncome()).toMatchObject({
      month: "2026-10",
      amountCents: 2,
    });
  });
});
