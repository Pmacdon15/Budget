import { describe, expect, it } from "vitest";
import {
  createRecurringIncome,
  recordRecurringIncome,
  skipRecurringIncome,
} from "@/actions/recurring-income";
import IncomePage from "@/app/(app)/income/page";
import { getRecurringIncomeForMonth } from "@/dal/recurring-income";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

const MONTH = "2026-10";

const render = async () =>
  textOf(await renderPage(IncomePage({ searchParams: searchParams(MONTH) })));

async function repeat(label: string, amount: string) {
  await createRecurringIncome({ label, amount, month: "2026-09" });
  const item = (await getRecurringIncomeForMonth(MONTH)).find(
    (i) => i.label === label,
  );
  if (!item) throw new Error(`${label} was not created`);
  return item;
}

describe("Take-home page repeating card", () => {
  it("keeps its frame in the static shell", async () => {
    const text = textOf(
      await renderShell(IncomePage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Repeating take-home");
    expect(text).toContain("Nothing counts until you add it");
  });

  it("explains it when nothing repeats", async () => {
    const text = await render();
    expect(text).toContain("Nothing repeating");
    expect(text).toContain("Repeat");
  });

  it("shows each paycheque as expected, added or skipped", async () => {
    await repeat("Day job", "2500");
    const side = await repeat("Side gig", "400");
    const bonus = await repeat("Bonus", "100");
    await recordRecurringIncome({
      recurringId: side.id,
      month: MONTH,
      amount: "350",
      receivedOn: "",
    });
    await skipRecurringIncome({ recurringId: bonus.id, month: MONTH });

    const text = await render();
    expect(text).toContain("Usually $2,500.00 · not added yet");
    expect(text).toContain("Add $2,500.00");
    expect(text).toContain("Different amount");
    expect(text).toContain("Added $350.00 · usually $400.00");
    expect(text).toContain("Skipped this month · usually $100.00");
    expect(text).toContain("Undo skip");
    // Only the added deposit counts as this month's take-home.
    expect(text).toContain("$350.00");
  });

  it("shows only the signed-in user's", async () => {
    await repeat("Day job", "2500");
    signInAs("user_b");
    const text = await render();
    expect(text).toContain("Nothing repeating");
    expect(text).not.toContain("Day job");
  });
});
