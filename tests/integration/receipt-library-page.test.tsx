import { auth } from "@clerk/nextjs/server";
import { describe, expect, it } from "vitest";
import ReceiptsPage from "@/app/(app)/receipts/page";
import { insertBillPayment } from "@/db/bill-payments";
import { insertExpense, insertExpenseLines } from "@/db/expenses";
import { insertFixedItem } from "@/db/fixed-items";
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

    const html = await render({ month: "2026-10" });
    const text = textOf(html);
    expect(text).toContain("1 receipt, newest first");
    expect(text).toContain("Costco Wholesale");
    expect(text).not.toContain("Home Depot");
    expect(text).toContain("$42.50");
    expect(text).toContain("$2.50 tax");
    expect(text).not.toContain("Someone else's store");

    // Photos go through the owner-checked route by receipt id only.
    expect(html).toMatch(/href="\/api\/receipts\/[0-9a-f-]{36}\/image"/);
    expect(html).not.toContain("receipts/user_a");
    expect(html).toContain('href="/expenses?month=2026-10"');

    // Selecting that date shows receipts for that month instead of the current month.
    const augustHtml = await render({ month: "2026-08" });
    const augustText = textOf(augustHtml);
    expect(augustText).toContain("1 receipt, newest first");
    expect(augustText).toContain("Home Depot");
    expect(augustText).toContain("New drill");
    expect(augustText).not.toContain("Costco Wholesale");
    expect(augustHtml).toContain('href="/expenses?month=2026-08"');
  });

  it("filters by the search in the URL regardless of month", async () => {
    await scan("user_a", "2026-08-14", "Home Depot");
    await scan("user_a", "2026-10-05", "Costco Wholesale");

    // Viewing October 2026, searching for August receipt "depot"
    const text = textOf(await render({ q: "depot", month: "2026-10" }));
    expect(text).toContain("1 match for “depot”");
    expect(text).toContain("Home Depot");
    expect(text).not.toContain("Costco Wholesale");
    expect(text).toContain("Clear");
  });

  it("says when a search finds nothing", async () => {
    await scan("user_a", "2026-10-05", "Costco Wholesale");
    const text = textOf(await render({ q: "zzz", month: "2026-10" }));
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
       select 'user_a', 'Shop ' || n, date '2026-10-01' + (n % 28), 100
       from generate_series(1, $1::int) as n`,
      [RECEIPT_LIBRARY_LIMIT + 1],
    );
    const text = textOf(await render({ month: "2026-10" }));
    expect(text).toContain(`Newest ${RECEIPT_LIBRARY_LIMIT} receipts`);
  });

  it("includes PDFs, emails, uploaded document files, and fixed bill receipts for the selected month", async () => {
    // 1. PDF receipt on an expense
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-12",
      description: "Hardware order",
      category: "Supplies",
      amountCents: 12_500,
    });
    await rows(
      `with r as (
         insert into receipts (user_id, merchant, total_cents, file_pathname, file_kind, file_name)
         values ('user_a', 'Fastener Co', 12500, 'receipts/user_a/test-pdf.pdf', 'pdf', 'invoice.pdf')
         returning id
       )
       update expenses set receipt_id = (select id from r)
       where user_id = 'user_a' and description = 'Hardware order'`,
    );

    // 2. Email receipt on an expense
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-15",
      description: "Domain renewal",
      category: "Utilities",
      amountCents: 2_000,
    });
    await rows(
      `with r as (
         insert into receipts (user_id, merchant, total_cents, file_pathname, file_kind, file_name)
         values ('user_a', 'Registrar', 2000, 'receipts/user_a/test-email.html', 'email', 'receipt.html')
         returning id
       )
       update expenses set receipt_id = (select id from r)
       where user_id = 'user_a' and description = 'Domain renewal'`,
    );

    // 3. Uploaded file receipt (.docx document copy) on an expense
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-18",
      description: "Consulting contract",
      category: "Professional Services",
      amountCents: 50_000,
    });
    await rows(
      `with r as (
         insert into receipts (user_id, merchant, total_cents, file_pathname, file_kind, file_name)
         values ('user_a', 'Consultant LLC', 50000, 'receipts/user_a/test-file.bin', 'file', 'contract.docx')
         returning id
       )
       update expenses set receipt_id = (select id from r)
       where user_id = 'user_a' and description = 'Consulting contract'`,
    );

    // 4. Fixed bill payment with receipt in October 2026
    const billId = await insertFixedItem("user_a", {
      name: "Internet Fiber",
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
         insert into receipts (user_id, merchant, total_cents, file_pathname, file_kind)
         values ('user_a', 'ISP Fiber', 8500, 'receipts/user_a/bill.pdf', 'pdf')
         returning id
       )
       update fixed_item_payments set receipt_id = (select id from r)
       where user_id = 'user_a' and month = '2026-10'`,
    );

    const octHtml = await render({ month: "2026-10" });
    const octText = textOf(octHtml);

    // All four documents appear in the October list
    expect(octText).toContain("Fastener Co");
    expect(octText).toContain("Registrar");
    expect(octText).toContain("Consultant LLC");
    expect(octText).toContain("Internet Fiber");

    // PDF receipt links
    expect(octHtml).toContain("View receipt PDF for Fastener Co");
    expect(octHtml).toContain("Download receipt PDF for Fastener Co");

    // Email receipt links
    expect(octHtml).toContain("View receipt email for Registrar");
    expect(octHtml).toContain("Download receipt email for Registrar");

    // Uploaded file receipt links
    expect(octHtml).toContain("Download receipt file for Consultant LLC");

    // Filtering by another month excludes October documents
    const septHtml = await render({ month: "2026-09" });
    const septText = textOf(septHtml);
    expect(septText).not.toContain("Fastener Co");
    expect(septText).not.toContain("Registrar");
    expect(septText).not.toContain("Consultant LLC");
    expect(septText).not.toContain("Internet Fiber");
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
