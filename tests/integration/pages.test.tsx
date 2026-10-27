import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpensesPage from "@/app/(app)/expenses/page";
import FixedPage from "@/app/(app)/fixed/page";
import IncomePage from "@/app/(app)/income/page";
import OverviewPage from "@/app/(app)/page";
import ReportPage from "@/app/(app)/report/page";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertIncome } from "@/db/income";
import { signInAs, signOut } from "../helpers/auth";
import { renderPage, searchParams, textOf } from "../helpers/render-page";

const MONTH = "2026-10";

async function seedMonth(userId = "user_a") {
  await insertIncome(userId, {
    month: MONTH,
    label: "Paycheque",
    amountCents: 300_000,
    receivedOn: "2026-10-15",
  });
  await insertIncome(userId, {
    month: "2026-09",
    label: "Paycheque",
    amountCents: 280_000,
    receivedOn: null,
  });
  await insertFixedItem(userId, {
    name: "Rent",
    category: "Housing",
    amountCents: 150_000,
    dueDay: 1,
    startMonth: "2026-01",
  });
  await insertExpense(userId, {
    month: MONTH,
    spentOn: "2026-10-05",
    description: "Costco run",
    category: "Groceries",
    amountCents: 25_000,
  });
}

const render = async (
  Page: (props: {
    searchParams: ReturnType<typeof searchParams>;
  }) => React.ReactElement,
  month = MONTH,
) => textOf(await renderPage(Page({ searchParams: searchParams(month) })));

/** `aria-label` → `href` for the stat cards' heading links. */
function statLinks(html: string) {
  return Object.fromEntries(
    [...html.matchAll(/<a\b[^>]*>/g)].flatMap(([tag]) => {
      const label = /aria-label="(Go to [^"]+)"/.exec(tag)?.[1];
      const href = /href="([^"]+)"/.exec(tag)?.[1];
      return label && href ? [[label, href.replace(/&amp;/g, "&")]] : [];
    }),
  );
}

describe("Overview page", () => {
  it("welcomes a brand-new user with setup steps", async () => {
    const text = await render(OverviewPage);
    expect(text).toContain("Welcome to Budget");
    expect(text).toContain("Add your take-home");
    expect(text).toContain("Add fixed bills");
    expect(text).toContain("Log spending");
  });

  it("summarizes the month", async () => {
    await seedMonth();
    const text = await render(OverviewPage);
    expect(text).toContain("October 2026");
    expect(text).toContain("$3,000.00"); // take-home
    expect(text).toContain("$1,500.00"); // fixed bills
    expect(text).toContain("$250.00"); // spending
    expect(text).toContain("$1,250.00"); // left over
    expect(text).toContain("42% of take-home"); // savings rate
    expect(text).toContain("58% of take-home spent");
    expect(text).toContain("Rent");
    expect(text).toContain("Day 1");
    expect(text).toContain("Costco run");
    expect(text).not.toContain("Welcome to Budget");
  });

  it("links the Take-home, Fixed bills and Spending cards to their pages, keeping the month", async () => {
    await seedMonth();
    const html = await renderPage(
      OverviewPage({ searchParams: searchParams(MONTH) }),
    );
    const links = statLinks(html);
    expect(links).toEqual({
      "Go to Take-home": `/income?month=${MONTH}`,
      "Go to Fixed bills": `/fixed?month=${MONTH}`,
      "Go to Spending": `/expenses?month=${MONTH}`,
    });
    // Left over stays a plain card.
    expect(html).not.toContain('aria-label="Go to Left over"');
    expect(textOf(html)).toContain("Left over");
  });

  it("keeps a different selected month on the card links", async () => {
    const html = await renderPage(
      OverviewPage({ searchParams: searchParams("2026-11") }),
    );
    expect(statLinks(html)["Go to Spending"]).toBe("/expenses?month=2026-11");
  });

  it("nudges for take-home when this month has none, suggesting last time's", async () => {
    await seedMonth();
    const text = await render(OverviewPage, "2026-11");
    expect(text).toContain("No take-home recorded for November 2026");
    expect(text).toContain("Last time it was $3,000.00 from “Paycheque”");
    expect(text).toContain("No spending logged");
  });

  it("shows only the signed-in user's money", async () => {
    await seedMonth("user_b");
    signInAs("user_a");
    expect(await render(OverviewPage)).toContain("Welcome to Budget");
  });

  describe("due soon", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-28T18:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("lists bills due in the next 7 days from today", async () => {
      await seedMonth(); // Rent, due on the 1st
      await insertFixedItem("user_a", {
        name: "Phone",
        category: "Utilities",
        amountCents: 6_500,
        dueDay: 20,
        startMonth: "2026-01",
      });
      const text = await render(OverviewPage);
      expect(text).toContain("Due soon");
      expect(text).toContain("Sun, Nov 1");
      expect(text).toContain("In 4 days");
      expect(text).toContain("Total due");
      expect(text).not.toContain("Nothing due this week");
    });

    it("says when nothing is due", async () => {
      await insertFixedItem("user_a", {
        name: "Phone",
        category: "Utilities",
        amountCents: 6_500,
        dueDay: 20,
        startMonth: "2026-01",
      });
      expect(await render(OverviewPage)).toContain("Nothing due this week");
    });
  });
});

describe("Fixed bills page", () => {
  it("shows an empty state", async () => {
    expect(await render(FixedPage)).toContain("No fixed bills this month");
  });

  it("lists active bills with a total", async () => {
    await seedMonth();
    await insertFixedItem("user_a", {
      name: "Old gym",
      category: "Health",
      amountCents: 4_000,
      dueDay: null,
      startMonth: "2025-01",
      endMonth: "2026-03",
    });
    const text = await render(FixedPage);
    expect(text).toContain("$1,500.00 / month");
    expect(text).toContain("1 active bill.");
    expect(text).toContain("Rent");
    expect(text).not.toContain("Old gym");
  });
});

describe("Take-home page", () => {
  it("shows an empty state", async () => {
    const text = await render(IncomePage);
    expect(text).toContain("Take-home");
    expect(text).toContain("No take-home yet");
  });

  it("lists the month's entries and history", async () => {
    await seedMonth();
    const text = await render(IncomePage);
    expect(text).toContain("Paycheque");
    expect(text).toContain("$3,000.00");
    expect(text).toContain("Month by month");
  });
});

describe("Spending page", () => {
  it("shows an empty state", async () => {
    expect(await render(ExpensesPage)).toContain(
      "No spending logged for October 2026",
    );
  });

  it("lists the month's expenses", async () => {
    await seedMonth();
    const text = await render(ExpensesPage);
    expect(text).toContain("$250.00 spent");
    expect(text).toContain("Costco run");
    expect(text).toContain("Groceries");
  });
});

describe("Report page", () => {
  it("shows an empty state", async () => {
    expect(await render(ReportPage)).toContain("Nothing to report yet");
  });

  it("summarizes the month against last month", async () => {
    await seedMonth();
    const text = await render(ReportPage);
    expect(text).toContain("October 2026 report");
    expect(text).toContain("Summary");
    expect(text).toContain("Category breakdown");
    expect(text).toContain("+$200.00"); // take-home vs September
    expect(text).toContain("Costco run");
    expect(text).toContain("Rent");
  });
});

describe("signed out", () => {
  it.each([
    ["overview", OverviewPage],
    ["fixed bills", FixedPage],
    ["take-home", IncomePage],
    ["spending", ExpensesPage],
    ["report", ReportPage],
  ])("the %s page sends visitors to sign-in", async (_name, Page) => {
    signOut();
    await expect(render(Page)).rejects.toMatchObject({ url: "/sign-in" });
  });
});
