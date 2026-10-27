import { describe, expect, it } from "vitest";
import ExpensesPage from "@/app/(app)/expenses/page";
import { insertExpense } from "@/db/expenses";
import { renderPage, searchParams, textOf } from "../helpers/render-page";

/*
 * The Spending page's ways to turn expenses into fixed bills: "Find
 * subscriptions" in the header (it loads its list only when opened) and
 * "Make fixed bill" in each row's menu.
 */

const render = async () =>
  textOf(
    await renderPage(ExpensesPage({ searchParams: searchParams("2026-10") })),
  );

describe("Spending page, subscriptions", () => {
  it("offers Find subscriptions next to the other actions", async () => {
    expect(await render()).toContain("Find subscriptions");
  });

  it("still lists an expense that looks like a subscription", async () => {
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-05",
      description: "Netflix",
      category: "Entertainment",
      amountCents: 1_699,
    });
    const text = await render();
    expect(text).toContain("Netflix");
    expect(text).toContain("$16.99 spent");
  });
});
