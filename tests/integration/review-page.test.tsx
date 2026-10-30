import { describe, expect, it } from "vitest";
import { createApiKey } from "@/actions/api-keys";
import ReviewPage from "@/app/(app)/review/page";
import { insertAccount } from "@/db/accounts";
import { insertPendingExpense } from "@/db/pending-expenses";
import { insertPendingIncome } from "@/db/pending-income";
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

  it("says which account each expense was paid from, or that one must be chosen", async () => {
    const account = (type: "chequing" | "credit_card", name: string) =>
      insertAccount("user_a", {
        type,
        name,
        institution: null,
        lastFour: null,
        balanceCents: 0,
        balanceSource: "manual",
        creditLimitCents: null,
        availableCreditCents: null,
        statementBalanceCents: null,
        paymentDueDate: null,
        minimumPaymentCents: null,
      });
    await account("chequing", "Chequing");
    const visa = await account("credit_card", "RBC Visa");
    await item("user_a", "Shell");
    await insertPendingExpense("user_a", {
      spentOn: "2026-10-21",
      description: "Esso",
      merchant: "Esso",
      category: "Transportation",
      amountCents: 6_000,
      source: null,
      client: "Claude",
      accountId: visa,
    });
    const text = await render();
    expect(text).toContain("paid from RBC Visa");
    // The Shell item came with no account and there are two.
    expect(text.match(/Choose an account/g)).toHaveLength(1);
  });

  it("doesn't ask for an account with only one", async () => {
    await item();
    const text = await render();
    expect(text).not.toContain("Choose an account");
  });

  it("shows income an AI found, as money in, with its payer and account", async () => {
    await insertPendingIncome("user_a", {
      receivedOn: "2026-10-14",
      label: "Drift Landscaping",
      payer: "DRIFT LANDSCAPING LTD",
      amountCents: 145_000,
      accountId: null,
      source:
        "notify@payments.interac.ca: DRIFT LANDSCAPING LTD sent you $1,450.00",
      client: "Claude",
      receipt: null,
    });
    await item();
    const text = await render();
    expect(text).toContain("2 items are waiting for you.");
    expect(text).toContain("Drift Landscaping");
    expect(text).toContain("Income");
    expect(text).toContain("+$1,450.00");
    expect(text).toContain("Oct 14, 2026");
    expect(text).toContain("DRIFT LANDSCAPING LTD");
    expect(text).toContain("into your main chequing");
    expect(text).toContain("Add income");
    expect(text).not.toContain("Possible duplicate");

    signInAs("user_b");
    expect(await render()).not.toContain("Drift Landscaping");
  });

  it("flags income that matches take-home already saved", async () => {
    await insertPendingIncome("user_a", {
      receivedOn: "2026-10-14",
      label: "Drift Landscaping",
      payer: null,
      amountCents: 145_000,
      accountId: null,
      source: null,
      client: null,
      receipt: null,
    });
    await rows(
      "insert into income (user_id, month, label, amount_cents, received_on) values ('user_a', '2026-10', 'Drift', 145000, '2026-10-14')",
    );
    expect(await render()).toContain("Possible duplicate");
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
