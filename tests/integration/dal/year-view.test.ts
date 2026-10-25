import { describe, expect, it } from "vitest";
import { getYearReport } from "@/dal/year-view";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertIncome } from "@/db/income";
import { signInAs, signOut } from "../../helpers/auth";

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

describe("getYearReport", () => {
  it("is empty for a new user", async () => {
    const report = await getYearReport(2026, "2026-10");
    expect(report.months).toHaveLength(10);
    expect(report.totals.activeMonths).toBe(0);
    expect(report.categories).toEqual([]);
    expect(report.best).toBeNull();
  });

  it("reads this year and the same months of last year", async () => {
    await insertFixedItem("user_a", {
      name: "Rent",
      category: "Housing",
      amountCents: 100_000,
      dueDay: 1,
      startMonth: "2025-01",
    });
    await pay("2026-01", 300_000);
    await pay("2026-02", 300_000);
    await pay("2025-01", 250_000);
    await pay("2025-12", 999_000); // after the comparison months
    await pay("2024-12", 777_000); // before the year before
    await spend("2026-02-14", 40_000, "Dining");
    await spend("2025-02-01", 10_000);

    const report = await getYearReport(2026, "2026-02");
    expect(report.totals).toMatchObject({
      incomeCents: 600_000,
      fixedCents: 200_000,
      variableCents: 40_000,
      netCents: 360_000,
    });
    expect(report.previous).toMatchObject({
      incomeCents: 250_000,
      fixedCents: 200_000,
      variableCents: 10_000,
    });
    expect(report.best?.month).toBe("2026-01");
    expect(report.worst?.month).toBe("2026-02");
    expect(report.categories.map((c) => c.category)).toEqual([
      "Housing",
      "Dining",
      "Groceries",
    ]);
  });

  it("only sees the signed-in user's data", async () => {
    await pay("2026-03", 500_000, "user_b");
    await spend("2026-03-03", 9_000, "Groceries", "user_b");
    await pay("2026-03", 100_000);

    expect((await getYearReport(2026, "2026-10")).totals.incomeCents).toBe(
      100_000,
    );
    signInAs("user_b");
    const theirs = await getYearReport(2026, "2026-10");
    expect(theirs.totals.incomeCents).toBe(500_000);
    expect(theirs.totals.variableCents).toBe(9_000);
  });

  it("sends signed-out visitors to sign-in", async () => {
    signOut();
    await expect(getYearReport(2026, "2026-10")).rejects.toMatchObject({
      url: "/sign-in",
    });
  });
});
