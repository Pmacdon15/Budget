import { describe, expect, it } from "vitest";
import { setCategoryBudgets } from "@/actions/category-budgets";
import ExpensesPage from "@/app/(app)/expenses/page";
import OverviewPage from "@/app/(app)/page";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import type { CategoryBudgetsFormValues } from "@/lib/category-budgets";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

const MONTH = "2026-10";

type Page = (props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => React.ReactElement;

const render = async (Page: Page) =>
  textOf(await renderPage(Page({ searchParams: searchParams(MONTH) })));

async function seed() {
  await insertFixedItem("user_a", {
    name: "Rent",
    category: "Housing",
    amountCents: 150_000,
    dueDay: 1,
    startMonth: "2026-01",
  });
  await insertExpense("user_a", {
    month: MONTH,
    spentOn: "2026-10-05",
    description: "Costco run",
    category: "Groceries",
    amountCents: 45_000,
  });
  await insertExpense("user_a", {
    month: MONTH,
    spentOn: "2026-10-09",
    description: "Pizza",
    category: "Dining",
    amountCents: 25_000,
  });
  expect(
    await setCategoryBudgets({
      month: "2026-01",
      limit_Housing: "1500",
      limit_Groceries: "600",
      limit_Dining: "200",
    } as CategoryBudgetsFormValues),
  ).toEqual({ ok: true });
}

describe.each([
  ["Overview", OverviewPage as Page],
  ["Spending", ExpensesPage as Page],
])("%s page budgets card", (_name, Page) => {
  it("keeps its frame in the static shell without any money", async () => {
    const text = textOf(
      await renderShell(Page({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Category budgets");
    expect(text).toContain(
      "Monthly limits, counting fixed bills and spending.",
    );
  });

  it("invites setting budgets when there are none", async () => {
    const text = await render(Page);
    expect(text).toContain("No budgets yet");
    expect(text).toContain("Set budgets");
  });

  it("shows each limit against fixed bills and spending", async () => {
    await seed();
    const text = await render(Page);
    expect(text).toContain("Edit budgets");
    expect(text).toContain("$250.00 / $200.00");
    expect(text).toContain("$50.00 over");
    expect(text).toContain("$1,500.00 / $1,500.00");
    expect(text).toContain("includes $1,500.00 in fixed bills");
    expect(text).toContain("$450.00 / $600.00");
    expect(text).toContain("$150.00 left");
    // Most used first: Dining (125%), Rent & Home (100%), Groceries (75%).
    expect(text.indexOf("$250.00 / $200.00")).toBeLessThan(
      text.indexOf("$1,500.00 / $1,500.00"),
    );
    expect(text.indexOf("$1,500.00 / $1,500.00")).toBeLessThan(
      text.indexOf("$450.00 / $600.00"),
    );
  });

  it("shows only the signed-in user's budgets", async () => {
    await seed();
    signInAs("user_b");
    const text = await render(Page);
    expect(text).toContain("No budgets yet");
    expect(text).not.toContain("$600.00");
  });
});
