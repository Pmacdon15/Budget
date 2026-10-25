import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecurringIncome } from "@/actions/recurring-income";
import OverviewPage from "@/app/(app)/page";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertIncome } from "@/db/income";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

beforeEach(() => {
  // Saturday 25 October 2026, mid-afternoon in Regina: 7 days left counting today.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T21:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const render = async (month: string) =>
  textOf(await renderPage(OverviewPage({ searchParams: searchParams(month) })));

async function seed(userId = "user_a") {
  await insertIncome(userId, {
    month: "2026-10",
    label: "Paycheque",
    amountCents: 300_000,
    receivedOn: "2026-10-15",
  });
  await insertFixedItem(userId, {
    name: "Rent",
    category: "Housing",
    amountCents: 150_000,
    dueDay: 1,
    startMonth: "2026-01",
  });
  await insertExpense(userId, {
    month: "2026-10",
    spentOn: "2026-10-05",
    description: "Costco run",
    category: "Groceries",
    amountCents: 25_000,
  });
}

describe("Safe to spend", () => {
  it("isn't in the static shell, since it depends on today's date", async () => {
    const text = textOf(
      await renderShell(OverviewPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).not.toContain("Safe to spend");
  });

  it("spreads what's left this month over the days left", async () => {
    await seed();
    const text = await render("2026-10");
    expect(text).toContain("Safe to spend");
    // $3,000 − $1,500 rent − $250 spending = $1,250 over 7 days.
    expect(text).toContain("$178.57 / day");
    expect(text).toContain(
      "$1,250.00 left for the next 7 days, through Oct 31.",
    );
  });

  it("says when the month is already over budget", async () => {
    await seed();
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-20",
      description: "Car repair",
      category: "Auto",
      amountCents: 140_000,
    });
    const text = await render("2026-10");
    expect(text).toContain("$0.00 / day");
    expect(text).toContain("Over by $150.00 this month, with 7 days to go.");
  });

  it("asks for take-home when none is recorded", async () => {
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-05",
      description: "Coffee",
      category: "Food",
      amountCents: 500,
    });
    const text = await render("2026-10");
    expect(text).toContain(
      "Add this month's take-home to see what's safe to spend.",
    );
  });

  it("mentions repeating take-home that isn't added yet without counting it", async () => {
    await seed();
    await createRecurringIncome({
      label: "Side gig",
      amount: "400",
      month: "2026-10",
    });
    const text = await render("2026-10");
    expect(text).toContain("$1,250.00 left");
    expect(text).toContain(
      "$400.00 in repeating take-home isn't added yet, so it isn't counted.",
    );
  });

  it("uses the whole month for a future month and hides for a past one", async () => {
    await insertIncome("user_a", {
      month: "2026-11",
      label: "Paycheque",
      amountCents: 300_000,
      receivedOn: null,
    });
    expect(await render("2026-11")).toContain(
      "$3,000.00 left for the next 30 days, through Nov 30.",
    );
    await seed();
    expect(await render("2026-09")).not.toContain("Safe to spend");
  });

  it("shows only the signed-in user's money", async () => {
    await seed("user_b");
    signInAs("user_a");
    const text = await render("2026-10");
    expect(text).toContain(
      "Add this month's take-home to see what's safe to spend.",
    );
    expect(text).not.toContain("$1,250.00");
  });
});
