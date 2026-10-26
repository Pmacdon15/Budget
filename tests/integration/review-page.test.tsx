import { describe, expect, it } from "vitest";
import { createApiKey } from "@/actions/api-keys";
import ReviewPage from "@/app/(app)/review/page";
import { insertPendingExpense } from "@/db/pending-expenses";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";
import { rows } from "../helpers/test-db";

const render = async () =>
  textOf(
    await renderPage(ReviewPage({ searchParams: searchParams("2026-10") })),
  ).replace(/\s/g, " ");

const item = (userId = "user_a", description = "Shell") =>
  insertPendingExpense(userId, {
    spentOn: "2026-10-20",
    description,
    merchant: "Shell",
    category: "Transportation",
    amountCents: 4_567,
    source: "Email from receipts@shell.ca: Your receipt",
    client: "Claude",
  });

describe("Review page", () => {
  it("explains itself when nothing is waiting", async () => {
    const text = await render();
    expect(text).toContain("Nothing to review");
    expect(text).toContain("https://budget.patmac.ca/api/mcp");
  });

  it("shows each item with its amount, date, source and app", async () => {
    await item();
    const text = await render();
    expect(text).toContain("1 item is waiting for you.");
    expect(text).toContain("Shell");
    expect(text).toContain("$45.67");
    expect(text).toContain("Oct 20, 2026");
    expect(text).toContain("from Claude");
    expect(text).toContain("Email from receipts@shell.ca: Your receipt");
    expect(text).toContain("Approve");
    expect(text).not.toContain("Possible duplicate");
  });

  it("flags an item that matches a saved expense", async () => {
    await item();
    await rows(
      "insert into expenses (user_id, month, spent_on, description, category, amount_cents) values ('user_a', '2026-10', '2026-10-20', 'Gas', 'Transportation', 4567)",
    );
    expect(await render()).toContain("Possible duplicate");
  });

  it("shows only the signed-in user's items and keys", async () => {
    signInAs("user_b");
    await item("user_b", "Someone else's");
    await createApiKey({ name: "Their key" });
    signInAs("user_a");
    const text = await render();
    expect(text).not.toContain("Someone else's");
    expect(text).not.toContain("Their key");
  });

  it("lists API keys by name and prefix only", async () => {
    const created = await createApiKey({ name: "Muse" });
    if (!created.ok) throw new Error(created.error);
    const text = await render();
    expect(text).toContain("Muse");
    expect(text).toContain(created.key.slice(0, 10));
    expect(text).toContain("never used");
    expect(text).not.toContain(created.key);
  });

  it("keeps the connector URL in the static shell, but not the items", async () => {
    await item();
    const text = textOf(
      await renderShell(ReviewPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Connect your AI");
    expect(text).toContain("https://budget.patmac.ca/api/mcp");
    expect(text).not.toContain("$45.67");
  });

  it("flags items that aren't paid yet or carry a receipt", async () => {
    await insertPendingExpense("user_a", {
      spentOn: "2026-10-25",
      description: "Natures Garden",
      merchant: "Natures Garden",
      category: "Personal",
      amountCents: 25_000,
      source: null,
      client: "Claude",
      unpaid: true,
      receipt: {
        merchant: "Natures Garden",
        purchasedOn: "2026-10-25",
        subtotalCents: null,
        taxCents: null,
        totalCents: 25_000,
        rawText: null,
        imagePathname: null,
      },
    });
    const text = await render();
    expect(text).toContain("Not paid yet");
    expect(text).toContain("Receipt attached");
  });
});
