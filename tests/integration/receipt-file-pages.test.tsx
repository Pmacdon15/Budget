import { describe, expect, it } from "vitest";
import ExpensesPage from "@/app/(app)/expenses/page";
import FixedPage from "@/app/(app)/fixed/page";
import ReceiptsPage from "@/app/(app)/receipts/page";
import ReviewPage from "@/app/(app)/review/page";
import { insertBillPayment } from "@/db/bill-payments";
import { insertExpense } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import { insertPendingExpense } from "@/db/pending-expenses";
import { signInAs } from "../helpers/auth";
import { renderPage, searchParams } from "../helpers/render-page";
import { rows } from "../helpers/test-db";

/*
 * Every place a receipt shows (Spending, Review, Fixed bills, Receipts) links
 * a saved PDF or email to the owner-checked route, to view and to download.
 * Pathnames never reach the page.
 */

const UUID = "[0-9a-f-]{36}";
const PDF_PATH = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b.pdf";
const EMAIL_PATH = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4c.html";

async function expenseWithFile(kind: "pdf" | "email", userId = "user_a") {
  await insertExpense(userId, {
    month: "2026-10",
    spentOn: "2026-10-20",
    description: "Rogers",
    category: "Utilities",
    amountCents: 8_500,
  });
  await rows(
    `with r as (
       insert into receipts (user_id, merchant, total_cents, file_pathname, file_kind)
       values ('${userId}', 'Rogers', 8500, '${kind === "pdf" ? PDF_PATH : EMAIL_PATH}', '${kind}')
       returning id
     )
     update expenses set receipt_id = (select id from r) where user_id = '${userId}'`,
  );
}

describe("receipt files in the app", () => {
  it("Spending links a PDF to view and download", async () => {
    await expenseWithFile("pdf");
    const html = await renderPage(
      ExpensesPage({ searchParams: searchParams("2026-10") }),
    );
    expect(html).toMatch(new RegExp(`href="/api/receipts/${UUID}/file"`));
    expect(html).toMatch(
      new RegExp(`href="/api/receipts/${UUID}/file\\?download=1"`),
    );
    expect(html).toContain("View receipt PDF for Rogers");
    expect(html).toContain("Download receipt PDF for Rogers");
    expect(html).not.toContain("receipts/user_a");
  });

  it("Review links the email an AI attached", async () => {
    const id = await insertPendingExpense("user_a", {
      spentOn: "2026-10-20",
      description: "Rogers",
      merchant: "Rogers",
      category: "Utilities",
      amountCents: 8_500,
      source: null,
      client: "Claude",
      receipt: {
        merchant: "Rogers",
        purchasedOn: null,
        subtotalCents: null,
        taxCents: null,
        totalCents: 8_500,
        rawText: null,
        imagePathname: null,
        filePathname: EMAIL_PATH,
        fileKind: "email",
      },
    });
    const html = await renderPage(
      ReviewPage({ searchParams: searchParams("2026-10") }),
    );
    expect(html).toContain("Receipt attached");
    expect(html).toContain(`href="/api/receipts/pending/${id}/email"`);
    expect(html).toContain(
      `href="/api/receipts/pending/${id}/email?download=1"`,
    );
    expect(html).toContain("View receipt email for Rogers");
    expect(html).not.toContain("receipts/user_a");
  });

  it("Fixed bills links the receipt on a bill paid this month, only for its owner", async () => {
    const billId = await insertFixedItem("user_a", {
      name: "Internet",
      category: "Utilities",
      amountCents: 8_500,
      dueDay: 20,
      startMonth: "2026-01",
    });
    await insertBillPayment("user_a", String(billId), "2026-10", {
      paidOn: "2026-10-20",
      amountCents: 8_500,
    });
    await rows(
      `with r as (
         insert into receipts (user_id, file_pathname, file_kind)
         values ('user_a', '${PDF_PATH}', 'pdf') returning id
       )
       update fixed_item_payments set receipt_id = (select id from r)`,
    );

    const render = (month: string) =>
      renderPage(FixedPage({ searchParams: searchParams(month) }));
    const html = await render("2026-10");
    expect(html).toMatch(new RegExp(`href="/api/receipts/${UUID}/file"`));
    expect(html).toContain("Download receipt PDF for Internet");
    // Another month's payment isn't this one.
    expect(await render("2026-09")).not.toContain("/file");

    signInAs("user_b");
    expect(await render("2026-10")).not.toContain("/file");
  });

  it("Receipts lists an email receipt with view and download links", async () => {
    await expenseWithFile("email");
    const html = await renderPage(
      ReceiptsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toMatch(new RegExp(`href="/api/receipts/${UUID}/email"`));
    expect(html).toMatch(
      new RegExp(`href="/api/receipts/${UUID}/email\\?download=1"`),
    );
    expect(html).toContain("View receipt email for Rogers");
    expect(html).toContain("Download receipt email for Rogers");
  });
});
