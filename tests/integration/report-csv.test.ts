import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(app)/report/csv/route";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertIncome } from "@/db/income";
import { signOut } from "../helpers/auth";

const get = (query = "") =>
  GET(new Request(`https://budget.test/report/csv${query}`));

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /report/csv", () => {
  it("downloads the month's line items and summary", async () => {
    await insertIncome("user_a", {
      month: "2026-10",
      label: "Paycheque",
      amountCents: 250_000,
      receivedOn: "2026-10-15",
    });
    await insertIncome("user_a", {
      month: "2026-10",
      label: "Side job",
      amountCents: 10_000,
      receivedOn: null,
    });
    await insertFixedItem("user_a", {
      name: "Rent",
      category: "Housing",
      amountCents: 150_000,
      dueDay: 1,
      startMonth: "2026-01",
    });
    await insertFixedItem("user_a", {
      name: "Phone",
      category: "Utilities",
      amountCents: 6_000,
      dueDay: null,
      startMonth: "2026-01",
    });
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-05",
      description: 'Dinner, "the good place"',
      category: "Dining",
      amountCents: 8_550,
    });

    const response = await get("?month=2026-10");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="budget-2026-10.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const lines = (await response.text()).split("\n");
    expect(lines).toEqual([
      "type,date,name,category,amount",
      "take-home,2026-10-15,Paycheque,,2500.00",
      "take-home,2026-10,Side job,,100.00",
      // No due day: dated to the month. Otherwise dated to the due day.
      "fixed,2026-10,Phone,Utilities,-60.00",
      "fixed,2026-10-01,Rent,Housing,-1500.00",
      'spending,2026-10-05,"Dinner, ""the good place""",Dining,-85.50',
      "",
      "summary,2026-10,Take-home,,2600.00",
      "summary,2026-10,Fixed bills,,-1560.00",
      "summary,2026-10,Spending,,-85.50",
      "summary,2026-10,Left over,,954.50",
    ]);
  });

  it("defaults to the current month and handles an empty month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
    const response = await get("?month=bogus");
    expect(response.headers.get("Content-Disposition")).toContain(
      "budget-2026-10.csv",
    );
    expect(await response.text()).toBe(
      [
        "type,date,name,category,amount",
        "",
        "summary,2026-10,Take-home,,0.00",
        "summary,2026-10,Fixed bills,,0.00",
        "summary,2026-10,Spending,,0.00",
        "summary,2026-10,Left over,,0.00",
      ].join("\n"),
    );
  });

  it("does not export anything when signed out", async () => {
    signOut();
    await expect(get("?month=2026-10")).rejects.toMatchObject({
      url: "/sign-in",
    });
  });
});
