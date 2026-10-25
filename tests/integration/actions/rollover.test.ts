import { describe, expect, it } from "vitest";
import { setCategoryBudgets } from "@/actions/category-budgets";
import { saveRollover } from "@/actions/rollover";
import { getRolloverAmounts, getRolloverSettings } from "@/dal/rollover";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import type { CategoryBudgetsFormValues } from "@/lib/category-budgets";
import type { RolloverFormValues } from "@/lib/rollover";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const save = (values: Record<string, string>) =>
  saveRollover({
    categories: "Groceries,Housing",
    rollover_Groceries: "on",
    rollover_Housing: "on",
    ...values,
  } as unknown as RolloverFormValues);

const turnOn = (startMonth: string, values: Record<string, string> = {}) =>
  save({ month: startMonth, enabled: "on", startMonth, ...values });

const carried = async (month: string) =>
  Object.fromEntries(
    (await getRolloverAmounts(month)).map((a) => [a.category, a.carriedCents]),
  );

/** Groceries $600 and Rent & Home $1,600 a month; $1,500 rent; some groceries. */
async function seed(userId = "user_a") {
  signInAs(userId);
  expect(
    await setCategoryBudgets({
      month: "2026-01",
      limit_Groceries: "600",
      limit_Housing: "1600",
    } as CategoryBudgetsFormValues),
  ).toEqual({ ok: true });
  await insertFixedItem(userId, {
    name: "Rent",
    category: "Housing",
    amountCents: 150_000,
    dueDay: 1,
    startMonth: "2026-01",
  });
  for (const [month, cents] of [
    ["2026-08", 50_000],
    ["2026-09", 45_000],
  ] as const) {
    await insertExpense(userId, {
      month,
      spentOn: `${month}-10`,
      description: "Groceries",
      category: "Groceries",
      amountCents: cents,
    });
  }
}

describe("rollover", () => {
  it("is off by default and changes nothing", async () => {
    await seed();
    expect(await getRolloverSettings("2026-10")).toEqual({
      enabled: false,
      startMonth: "2026-10",
      excluded: [],
    });
    expect(await getRolloverAmounts("2026-10")).toEqual([]);
    expect(await rows("select * from rollover_settings")).toEqual([]);
  });

  it("stays off when saved with the box unticked", async () => {
    await seed();
    expect(await save({ month: "2026-10", startMonth: "2026-08" })).toEqual({
      ok: true,
    });
    expect((await getRolloverSettings("2026-10")).enabled).toBe(false);
    expect(await getRolloverAmounts("2026-10")).toEqual([]);
  });

  it("carries unspent budget from the start month on, counting fixed bills", async () => {
    await seed();
    expect(await turnOn("2026-08")).toEqual({ ok: true });

    // Nothing carries into the start month.
    expect(await carried("2026-08")).toEqual({ Groceries: 0, Housing: 0 });
    // August: $100 groceries left; $100 left after rent.
    expect(await carried("2026-09")).toEqual({
      Groceries: 10_000,
      Housing: 10_000,
    });
    // September: $600 + $100 - $450 = $250; $1,600 + $100 - $1,500 = $200.
    expect(await carried("2026-10")).toEqual({
      Groceries: 25_000,
      Housing: 20_000,
    });
    // Nothing before the start month.
    expect(await getRolloverAmounts("2026-07")).toEqual([]);
  });

  it("starts from the month the user picks", async () => {
    await seed();
    await turnOn("2026-09");
    expect(await carried("2026-10")).toEqual({
      Groceries: 15_000,
      Housing: 10_000,
    });
  });

  it("lets the user set the real amount carried in, replacing the calculated one", async () => {
    await seed();
    await turnOn("2026-08");
    // Missing receipts: only $40 of groceries money was really left after August.
    expect(
      await save({
        month: "2026-09",
        enabled: "on",
        startMonth: "2026-08",
        carry_Groceries: "40",
      }),
    ).toEqual({ ok: true });

    const [groceries] = await getRolloverAmounts("2026-09");
    expect(groceries).toEqual({
      category: "Groceries",
      carriedCents: 4_000,
      calculatedCents: 10_000,
      adjusted: true,
    });
    // October builds on it: $600 + $40 - $450.
    expect((await carried("2026-10")).Groceries).toBe(19_000);

    // Blank goes back to the calculated amount.
    await save({ month: "2026-09", enabled: "on", startMonth: "2026-08" });
    expect((await carried("2026-09")).Groceries).toBe(10_000);
    expect(await rows("select * from rollover_adjustments")).toEqual([]);
  });

  it("sets the starting amount for a messy first month", async () => {
    await seed();
    await turnOn("2026-09", { carry_Groceries: "75" });
    expect((await carried("2026-09")).Groceries).toBe(7_500);
    expect((await carried("2026-10")).Groceries).toBe(22_500);
  });

  it("leaves out categories the user unticks", async () => {
    await seed();
    await save({
      month: "2026-08",
      enabled: "on",
      startMonth: "2026-08",
      rollover_Housing: "",
    });
    expect((await getRolloverSettings("2026-10")).excluded).toEqual([
      "Housing",
    ]);
    expect(await carried("2026-10")).toEqual({ Groceries: 25_000 });

    await turnOn("2026-08");
    expect(await carried("2026-10")).toEqual({
      Groceries: 25_000,
      Housing: 20_000,
    });
  });

  it("keeps each user's rollover to themselves", async () => {
    await seed("user_a");
    await seed("user_b");
    signInAs("user_a");
    await turnOn("2026-08", { carry_Groceries: "500" });

    signInAs("user_b");
    expect(await getRolloverAmounts("2026-10")).toEqual([]);
    await turnOn("2026-09");
    expect((await carried("2026-10")).Groceries).toBe(15_000);

    signInAs("user_a");
    expect((await carried("2026-08")).Groceries).toBe(50_000);
    expect(await getRolloverSettings("2026-10")).toMatchObject({
      enabled: true,
      startMonth: "2026-08",
    });
  });

  it("rejects a bad amount with a field error and saves nothing", async () => {
    await seed();
    expect(await turnOn("2026-08", { carry_Groceries: "lots" })).toMatchObject({
      ok: false,
      fieldErrors: { carry_Groceries: ["Enter a valid amount, like 50.00"] },
    });
    expect(await rows("select * from rollover_settings")).toEqual([]);
  });

  it("needs a signed-in user", async () => {
    signOut();
    expect(await turnOn("2026-08")).toMatchObject({ ok: false });
    expect(await rows("select * from rollover_settings")).toEqual([]);
  });
});
