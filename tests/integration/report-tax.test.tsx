import { describe, expect, it } from "vitest";
import ReportPage from "@/app/(app)/report/page";
import { insertExpenseLines } from "@/db/expenses";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

const render = async (month = "2026-10") =>
  textOf(await renderPage(ReportPage({ searchParams: searchParams(month) })));

async function scan(userId: string, month: string, taxCents: number) {
  await insertExpenseLines(
    userId,
    { month, spentOn: `${month}-05`, description: "Costco" },
    [{ category: "Groceries", amountCents: 11_300 }],
    {
      imagePathname: `receipts/${userId}/${crypto.randomUUID()}.jpg`,
      merchant: "Costco",
      purchasedOn: `${month}-05`,
      subtotalCents: 11_300 - taxCents,
      taxCents,
      totalCents: 11_300,
      rawText: null,
    },
  );
}

describe("Report page GST card", () => {
  it("keeps its frame in the static shell", async () => {
    const text = textOf(
      await renderShell(ReportPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("GST paid");
    expect(text).toContain(
      "Tax read off your scanned receipts, for the month and the year.",
    );
  });

  it("says when there are no receipts with tax", async () => {
    expect(await render()).toContain("No receipts with tax in 2026 yet.");
  });

  it("shows GST for the month and the year", async () => {
    await scan("user_a", "2026-03", 500);
    await scan("user_a", "2026-10", 1_300);
    await scan("user_a", "2026-10", 200);

    const text = await render();
    expect(text).toContain("October 2026 $15.00 2 receipts");
    expect(text).toContain("All of 2026 $20.00 3 receipts");
    expect(text).toContain("March 2026 1 $5.00");
    expect(text).toContain("2026 total 3 $20.00");
  });

  it("only shows the signed-in user's tax", async () => {
    await scan("user_b", "2026-10", 9_900);
    signInAs("user_a");
    const text = await render();
    expect(text).not.toContain("$99.00");
    expect(text).toContain("No receipts with tax in 2026 yet.");
  });
});
