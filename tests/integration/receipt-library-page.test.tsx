import { auth } from "@clerk/nextjs/server";
import { describe, expect, it } from "vitest";
import ReceiptsPage from "@/app/(app)/receipts/page";
import { insertExpenseLines } from "@/db/expenses";
import { RECEIPT_LIBRARY_LIMIT } from "@/lib/schemas/receipt-library";
import { signInAs, signOut } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  textOf,
} from "../helpers/render-page";
import { rows } from "../helpers/test-db";

const scan = (
  userId: string,
  spentOn: string,
  merchant: string,
  description = "Shopping",
) =>
  insertExpenseLines(
    userId,
    { month: spentOn.slice(0, 7), spentOn, description },
    [{ category: "Groceries", amountCents: 4_250 }],
    {
      imagePathname: `receipts/${userId}/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg`,
      merchant,
      purchasedOn: spentOn,
      subtotalCents: 4_000,
      taxCents: 250,
      totalCents: 4_250,
      rawText: null,
    },
  );

const render = (params: Record<string, string> = {}) =>
  renderPage(ReceiptsPage({ searchParams: Promise.resolve(params) }));

describe("Receipts page", () => {
  it("lists the user's receipts with links to the photo and its month", async () => {
    await scan("user_a", "2026-08-14", "Home Depot", "New drill");
    await scan("user_a", "2026-10-05", "Costco Wholesale");
    await scan("user_b", "2026-10-06", "Someone else's store");

    const html = await render();
    const text = textOf(html);
    expect(text).toContain("2 receipts, newest first");
    expect(text).toContain("Costco Wholesale");
    expect(text).toContain("Home Depot");
    expect(text).toContain("New drill");
    expect(text).toContain("$42.50");
    expect(text).toContain("$2.50 tax");
    expect(text).not.toContain("Someone else's store");
    expect(text.indexOf("Costco Wholesale")).toBeLessThan(
      text.indexOf("Home Depot"),
    );

    // Photos go through the owner-checked route by receipt id only.
    expect(html).toMatch(/href="\/api\/receipts\/[0-9a-f-]{36}\/image"/);
    expect(html).not.toContain("receipts/user_a");
    expect(html).toContain('href="/expenses?month=2026-08"');
  });

  it("filters by the search in the URL", async () => {
    await scan("user_a", "2026-08-14", "Home Depot");
    await scan("user_a", "2026-10-05", "Costco Wholesale");

    const text = textOf(await render({ q: "depot" }));
    expect(text).toContain("1 match for “depot”");
    expect(text).toContain("Home Depot");
    expect(text).not.toContain("Costco Wholesale");
    expect(text).toContain("Clear");
  });

  it("says when a search finds nothing", async () => {
    await scan("user_a", "2026-10-05", "Costco Wholesale");
    const text = textOf(await render({ q: "zzz" }));
    expect(text).toContain("No receipts match that search");
  });

  it("points a new user to scanning", async () => {
    const text = textOf(await render());
    expect(text).toContain("Nothing scanned yet");
    expect(text).toContain("No receipts yet");
    expect(text).toContain("Spending");
  });

  it("says when the list was cut off", async () => {
    await rows(
      `insert into receipts (user_id, merchant, purchased_on, total_cents)
       select 'user_a', 'Shop ' || n, date '2026-01-01' + n, 100
       from generate_series(1, $1::int) as n`,
      [RECEIPT_LIBRARY_LIMIT + 1],
    );
    const text = textOf(await render());
    expect(text).toContain(`Newest ${RECEIPT_LIBRARY_LIMIT} receipts`);
  });

  it("sends visitors to sign-in", async () => {
    signOut();
    await expect(render()).rejects.toMatchObject({ url: "/sign-in" });
    signInAs("user_a");
  });

  it("keeps its heading, search box and table header in the static shell", async () => {
    const html = await renderShell(
      ReceiptsPage({ searchParams: pendingSearchParams() }),
    );
    const text = textOf(html);
    for (const label of [
      "Receipts",
      "Scanned receipts",
      "Search",
      "Receipt",
      "Date",
      "Total",
    ]) {
      expect(text).toContain(label);
    }
    expect(html).toContain('name="q"');
    expect(auth).not.toHaveBeenCalled();
  });
});
