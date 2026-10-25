import { describe, expect, it } from "vitest";
import { setCategoryBudgets } from "@/actions/category-budgets";
import { saveRollover } from "@/actions/rollover";
import ExpensesPage from "@/app/(app)/expenses/page";
import OverviewPage from "@/app/(app)/page";
import { insertExpense } from "@/db/expenses";
import type { CategoryBudgetsFormValues } from "@/lib/category-budgets";
import type { RolloverFormValues } from "@/lib/rollover";
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

/** $600 groceries budget; $450 spent in September and $500 in October. */
async function seed() {
  expect(
    await setCategoryBudgets({
      month: "2026-01",
      limit_Groceries: "600",
    } as CategoryBudgetsFormValues),
  ).toEqual({ ok: true });
  for (const [month, cents] of [
    ["2026-09", 45_000],
    [MONTH, 50_000],
  ] as const) {
    await insertExpense("user_a", {
      month,
      spentOn: `${month}-10`,
      description: "Groceries",
      category: "Groceries",
      amountCents: cents,
    });
  }
}

const turnOn = () =>
  saveRollover({
    month: "2026-09",
    enabled: "on",
    startMonth: "2026-09",
    categories: "Groceries",
    rollover_Groceries: "on",
  } as RolloverFormValues);

describe.each([
  ["Overview", OverviewPage as Page],
  ["Spending", ExpensesPage as Page],
])("%s page rollover", (_name, Page) => {
  it("keeps the budgets card's shell free of rollover amounts", async () => {
    await seed();
    await turnOn();
    const text = textOf(
      await renderShell(Page({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Category budgets");
    expect(text).not.toContain("rolled over");
  });

  it("offers rollover only once there's a budget", async () => {
    expect(await render(Page)).not.toContain("Rollover");
    await seed();
    const text = await render(Page);
    expect(text).toContain("Rollover");
    expect(text).not.toContain("rolled over");
    expect(text).toContain("$500.00 / $600.00");
    expect(text).toContain("$100.00 left");
  });

  it("shows the carried amount next to the budget and counts it as left", async () => {
    await seed();
    expect(await turnOn()).toEqual({ ok: true });
    const text = await render(Page);
    expect(text).toContain("Rollover on");
    expect(text).toContain("$500.00 / $600.00 + $150.00 rolled over");
    expect(text).toContain("$250.00 left");
  });

  it("shows only the signed-in user's rollover", async () => {
    await seed();
    await turnOn();
    signInAs("user_b");
    const text = await render(Page);
    expect(text).not.toContain("rolled over");
    expect(text).not.toContain("Rollover");
  });
});
