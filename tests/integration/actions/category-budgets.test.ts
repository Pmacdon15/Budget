import { describe, expect, it } from "vitest";
import { setCategoryBudgets } from "@/actions/category-budgets";
import { getBudgetProgress, getCategoryLimits } from "@/dal/category-budgets";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import type { CategoryBudgetsFormValues } from "@/lib/category-budgets";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const save = (month: string, limits: Record<string, string> = {}) =>
  setCategoryBudgets({ month, ...limits } as CategoryBudgetsFormValues);

const limitsIn = async (month: string) =>
  Object.fromEntries(
    (await getCategoryLimits(month)).map((l) => [l.category, l.limitCents]),
  );

describe("category budget actions", () => {
  it("sets limits that apply from the month onward", async () => {
    expect(
      await save("2026-03", { limit_Groceries: "600", limit_Dining: "200" }),
    ).toEqual({ ok: true });

    expect(await limitsIn("2026-02")).toEqual({});
    expect(await limitsIn("2026-03")).toEqual({
      Groceries: 60_000,
      Dining: 20_000,
    });
    expect(await limitsIn("2027-01")).toEqual({
      Groceries: 60_000,
      Dining: 20_000,
    });
  });

  it("keeps earlier months' limits when a later month changes them", async () => {
    await save("2026-03", { limit_Groceries: "600", limit_Dining: "200" });
    await save("2026-06", { limit_Groceries: "700", limit_Dining: "" });

    expect(await limitsIn("2026-05")).toEqual({
      Groceries: 60_000,
      Dining: 20_000,
    });
    // Blank clears Dining from June on.
    expect(await limitsIn("2026-06")).toEqual({ Groceries: 70_000 });
    expect(await limitsIn("2026-12")).toEqual({ Groceries: 70_000 });
  });

  it("edits the same month in place", async () => {
    await save("2026-03", { limit_Groceries: "600" });
    await save("2026-03", { limit_Groceries: "650" });
    expect(await limitsIn("2026-03")).toEqual({ Groceries: 65_000 });
    expect(await rows("select * from category_budgets")).toHaveLength(1);
  });

  it("writes nothing when nothing changed", async () => {
    await save("2026-03", { limit_Groceries: "600" });
    await save("2026-05", { limit_Groceries: "600.00" });
    const stored = await rows(
      "select start_month from category_budgets order by start_month",
    );
    expect(stored.map((r) => r.start_month)).toEqual(["2026-03"]);
  });

  it("rejects a bad amount with a field error and saves nothing", async () => {
    expect(
      await save("2026-03", { limit_Groceries: "600", limit_Dining: "abc" }),
    ).toEqual({
      ok: false,
      error: "Enter a valid amount, like 300.00",
      fieldErrors: { limit_Dining: ["Enter a valid amount, like 300.00"] },
    });
    expect(await rows("select * from category_budgets")).toEqual([]);
  });

  it("keeps each user's budgets to themselves", async () => {
    await save("2026-03", { limit_Groceries: "600" });
    signInAs("user_b");
    expect(await limitsIn("2026-03")).toEqual({});
    await save("2026-03", { limit_Groceries: "100" });
    signInAs("user_a");
    expect(await limitsIn("2026-03")).toEqual({ Groceries: 60_000 });
  });

  it("needs a signed-in user", async () => {
    signOut();
    expect(await save("2026-03", { limit_Groceries: "600" })).toMatchObject({
      ok: false,
    });
    expect(await rows("select * from category_budgets")).toEqual([]);
  });
});

describe("getBudgetProgress", () => {
  it("compares each limit with fixed bills plus spending that month", async () => {
    await insertFixedItem("user_a", {
      name: "Rent",
      category: "Housing",
      amountCents: 150_000,
      dueDay: 1,
      startMonth: "2026-01",
    });
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-03",
      description: "Costco",
      category: "Groceries",
      amountCents: 45_000,
    });
    await insertExpense("user_a", {
      month: "2026-09",
      spentOn: "2026-09-20",
      description: "Last month",
      category: "Groceries",
      amountCents: 99_000,
    });
    // Another user's spending never counts.
    await insertExpense("user_b", {
      month: "2026-10",
      spentOn: "2026-10-03",
      description: "Not mine",
      category: "Groceries",
      amountCents: 77_000,
    });
    await save("2026-01", {
      limit_Housing: "1500",
      limit_Groceries: "600",
      limit_Health: "50",
    });

    expect(await getBudgetProgress("2026-10")).toEqual([
      {
        category: "Housing",
        limitCents: 150_000,
        spentCents: 150_000,
        fixedCents: 150_000,
        leftCents: 0,
        usage: 1,
      },
      {
        category: "Groceries",
        limitCents: 60_000,
        spentCents: 45_000,
        fixedCents: 0,
        leftCents: 15_000,
        usage: 0.75,
      },
      {
        category: "Health",
        limitCents: 5_000,
        spentCents: 0,
        fixedCents: 0,
        leftCents: 5_000,
        usage: 0,
      },
    ]);
  });

  it("is empty with no budgets set", async () => {
    expect(await getBudgetProgress("2026-10")).toEqual([]);
  });
});
