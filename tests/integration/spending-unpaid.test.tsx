import { describe, expect, it } from "vitest";
import ExpensesPage from "@/app/(app)/expenses/page";
import { insertExpense } from "@/db/expenses";
import { renderPage, searchParams, textOf } from "../helpers/render-page";
import { rows } from "../helpers/test-db";

/*
 * The Spending list shows when an expense isn't paid yet, and only links a
 * receipt's 📎 to a photo when there is one (receipts read off an email may
 * have details only).
 */

const render = async () =>
  renderPage(ExpensesPage({ searchParams: searchParams("2026-10") }));

async function expense(description: string) {
  await insertExpense("user_a", {
    month: "2026-10",
    spentOn: "2026-10-20",
    description,
    category: "Personal",
    amountCents: 25_000,
  });
}

describe("Spending page status", () => {
  it("marks an unpaid expense", async () => {
    await expense("Natures Garden");
    await rows("update expenses set unpaid = true");
    expect(textOf(await render())).toContain("Not paid yet");
  });

  it("says nothing for a paid one", async () => {
    await expense("Shell");
    expect(textOf(await render())).not.toContain("Not paid yet");
  });

  it("links a receipt only when it has a photo", async () => {
    await expense("Emailed receipt");
    await rows(
      "with r as (insert into receipts (user_id, total_cents) values ('user_a', 25000) returning id) update expenses set receipt_id = (select id from r)",
    );
    const html = await render();
    expect(html).toContain("Receipt details saved, no photo");
    expect(html).not.toContain("/image");

    await rows(
      "update receipts set image_pathname = 'receipts/user_a/00000000-0000-4000-8000-000000000001.jpg'",
    );
    expect(await render()).toMatch(/\/api\/receipts\/[0-9a-f-]+\/image/);
  });
});
