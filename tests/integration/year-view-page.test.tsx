import { auth } from "@clerk/nextjs/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "@/app/(app)/report/page";
import YearViewPage from "@/app/(app)/report/year/page";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertIncome } from "@/db/income";
import { signOut } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

// "This month" for the year in progress; only `Date` is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T18:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const render = async (params: Record<string, string>) =>
  textOf(
    await renderPage(YearViewPage({ searchParams: Promise.resolve(params) })),
  );

async function seed(userId = "user_a") {
  await insertFixedItem(userId, {
    name: "Rent",
    category: "Housing",
    amountCents: 150_000,
    dueDay: 1,
    startMonth: "2025-01",
  });
  await insertIncome(userId, {
    month: "2026-09",
    label: "Paycheque",
    amountCents: 300_000,
    receivedOn: null,
  });
  await insertIncome(userId, {
    month: "2026-10",
    label: "Paycheque",
    amountCents: 320_000,
    receivedOn: null,
  });
  await insertIncome(userId, {
    month: "2025-10",
    label: "Paycheque",
    amountCents: 200_000,
    receivedOn: null,
  });
  await insertExpense(userId, {
    month: "2026-10",
    spentOn: "2026-10-05",
    description: "Costco run",
    category: "Groceries",
    amountCents: 25_000,
  });
}

describe("Year view page", () => {
  it("keeps its heading, card titles and labels in the static shell", async () => {
    const html = await renderShell(
      YearViewPage({ searchParams: pendingSearchParams() }),
    );
    const text = textOf(html);
    expect(auth).not.toHaveBeenCalled();
    expect(html).toMatch(/<h1[\s>]/);
    for (const label of [
      "in review",
      "Take-home",
      "Total out",
      "Left over",
      "Savings rate",
      "Month by month",
      "Compared with last year",
      "Best and worst months",
      "Totals by month",
      "Totals by category",
      "Monthly report",
    ]) {
      expect(text).toContain(label);
    }
    expect(text).not.toMatch(/\$\d/);
  });

  it("reports the year in progress against the same months last year", async () => {
    await seed();
    const text = await render({ year: "2026" });
    expect(text).toContain("2026 in review");
    expect(text).toContain("Jan–Oct 2026");
    expect(text).toContain("Jan–Oct 2025");
    expect(text).toContain("$6,200.00"); // take-home this year
    expect(text).toContain("+$4,200.00"); // vs $2,000 last year
    expect(text).toContain("Best month");
    expect(text).toContain("September 2026");
    expect(text).toContain("Groceries");
    // November hasn't happened, so its rent isn't counted.
    expect(text).not.toContain("November 2026");
  });

  it("uses the year of ?month= from the nav", async () => {
    await seed();
    expect(await render({ month: "2025-04" })).toContain("2025 in review");
  });

  it("shows empty states for a new user", async () => {
    const text = await render({ year: "2026" });
    expect(text).toContain("Nothing recorded in 2026 yet.");
    expect(text).toContain(
      "Best and worst months show once two months have data.",
    );
    expect(text).toContain("No bills or spending in Jan–Oct 2026.");
  });

  it("only shows the signed-in user's money", async () => {
    await seed("user_b");
    const text = await render({ year: "2026" });
    expect(text).not.toContain("$6,200.00");
    expect(text).not.toContain("Groceries");
  });

  it("links years and hides next year for the current one", async () => {
    const html = await renderPage(
      YearViewPage({ searchParams: Promise.resolve({ year: "2026" }) }),
    );
    expect(html).toContain('href="/report/year?year=2025"');
    expect(html).not.toContain('href="/report/year?year=2027"');
    expect(html).toContain('href="/report?month=2026-10"');
  });

  it("sends signed-out visitors to sign-in", async () => {
    signOut();
    await expect(render({ year: "2026" })).rejects.toMatchObject({
      url: "/sign-in",
    });
  });

  it("is linked from the monthly report for the same year", async () => {
    const html = await renderPage(
      ReportPage({ searchParams: searchParams("2025-06") }),
    );
    expect(html).toContain('href="/report/year?year=2025"');
  });
});
