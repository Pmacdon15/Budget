import { describe, expect, it } from "vitest";
import ExpensesPage from "@/app/(app)/expenses/page";
import { insertExpense } from "@/db/expenses";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  textOf,
} from "../helpers/render-page";

const MONTH = "2026-10";

async function seed(userId = "user_a") {
  for (const [spentOn, description, category, amountCents] of [
    ["2026-10-05", "Costco run", "Groceries", 45_000],
    ["2026-10-09", "Pizza", "Dining", 2_500],
    ["2026-09-14", "Costco gas", "Transportation", 6_000],
  ] as const) {
    await insertExpense(userId, {
      month: spentOn.slice(0, 7),
      spentOn,
      description,
      category,
      amountCents,
    });
  }
}

const render = async (params: Record<string, string>) =>
  textOf(
    await renderPage(
      ExpensesPage({
        searchParams: Promise.resolve({ month: MONTH, ...params }),
      }),
    ),
  );

describe("Spending page search", () => {
  it("lists everything for the month without a search", async () => {
    await seed();
    const text = await render({});
    expect(text).toContain("Costco run");
    expect(text).toContain("Pizza");
    expect(text).toContain("2 expenses");
    expect(text).not.toContain("Costco gas");
  });

  it("narrows the list by text and shows what matched", async () => {
    await seed();
    const text = await render({ q: "costco" });
    expect(text).toContain("Costco run");
    expect(text).not.toContain("Pizza");
    expect(text).toContain("1 match in October 2026 · $450.00");
  });

  it("filters by category and amount", async () => {
    await seed();
    expect(await render({ category: "Dining" })).not.toContain("Costco run");
    const cheap = await render({ max: "30" });
    expect(cheap).toContain("Pizza");
    expect(cheap).not.toContain("Costco run");
  });

  it("searches all months when asked", async () => {
    await seed();
    const text = await render({ q: "costco", scope: "all" });
    expect(text).toContain("Costco run");
    expect(text).toContain("Costco gas");
    expect(text).toContain("2 matches across all months");
  });

  it("says when nothing matches", async () => {
    await seed();
    const text = await render({ q: "yacht" });
    expect(text).toContain("No expenses match your search.");
    expect(text).toContain("0 matches");
  });

  it("only searches the signed-in user's spending", async () => {
    await seed("user_b");
    signInAs("user_a");
    const text = await render({ q: "costco", scope: "all" });
    expect(text).not.toContain("Costco run");
    expect(text).toContain("No expenses match your search.");
  });

  it("keeps the search form in the static shell", async () => {
    const text = textOf(
      await renderShell(ExpensesPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Search");
    expect(text).toContain("All categories");
    expect(text).toContain("This month");
  });
});
