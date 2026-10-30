import { beforeEach, describe, expect, it } from "vitest";
import { GET as manifestGET } from "@/app/api/receipts/export/route";
import { GET as summaryGET } from "@/app/api/receipts/export/summary/route";
import {
  insertExpense,
  insertExpenseLines,
  type ReceiptValues,
} from "@/db/expenses";
import {
  MAX_EXPORT_RECEIPTS,
  tooManyReceiptsMessage,
} from "@/lib/receipt-export";
import { signInAs, signOut } from "../helpers/auth";
import { testPg } from "../helpers/test-db";

const manifest = (query: string) =>
  manifestGET(new Request(`https://budget.test/api/receipts/export?${query}`));

const summary = (query: string) =>
  summaryGET(
    new Request(`https://budget.test/api/receipts/export/summary?${query}`),
  );

const OCTOBER = "from=2026-10-01&to=2026-10-31";
const ALL_FORMATS = "format=csv&format=xlsx&format=pdf";

const photo = (over: Partial<ReceiptValues> = {}): ReceiptValues => ({
  imagePathname: `receipts/user_a/${crypto.randomUUID()}.jpg`,
  merchant: "Costco Wholesale",
  purchasedOn: "2026-10-05",
  subtotalCents: 10_000,
  taxCents: 1_300,
  totalCents: 11_300,
  rawText: null,
  ...over,
});

async function one<T>(sql: string, params: unknown[]) {
  const { rows } = await testPg().query<T>(sql, params);
  return rows[0] as T;
}

/** A receipt saved as a file (PDF or email), like the AI connector saves. */
async function fileReceipt(
  userId: string,
  kind: "pdf" | "email",
  merchant: string,
) {
  const ext = kind === "pdf" ? "pdf" : "html";
  const { id } = await one<{ id: string }>(
    `insert into receipts (user_id, merchant, file_pathname, file_kind, file_name, email_subject)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      userId,
      merchant,
      `receipts/${userId}/${crypto.randomUUID()}.${ext}`,
      kind,
      kind === "pdf" ? "bill.pdf" : null,
      kind === "email" ? `Your ${merchant} receipt` : null,
    ],
  );
  return id;
}

const ids: Record<string, string> = {};

beforeEach(async () => {
  const { id: chequing } = await one<{ id: string }>(
    `insert into accounts (user_id, type, name) values ('user_a', 'chequing', 'Chequing') returning id`,
    [],
  );

  // A receipt split across two categories: one photo, two expense parts.
  await insertExpenseLines(
    "user_a",
    { month: "2026-10", spentOn: "2026-10-05", description: "Costco" },
    [
      { category: "Groceries", amountCents: 8_000 },
      { category: "Health", amountCents: 3_300 },
    ],
    photo(),
  );

  // An emailed receipt (no attachment), not paid yet, from Chequing.
  ids.email = await fileReceipt("user_a", "email", "Amazon");
  await testPg().query(
    `insert into expenses (user_id, month, spent_on, description, category, amount_cents, receipt_id, unpaid, account_id)
     values ('user_a', '2026-10', '2026-10-10', 'Phone case', 'Shopping', 2500, $1, true, $2)`,
    [ids.email, chequing],
  );

  // No receipt at all, but it's still spending.
  await insertExpense("user_a", {
    month: "2026-10",
    spentOn: "2026-10-12",
    description: "Farmers market",
    category: "Groceries",
    amountCents: 700,
  });

  // A fixed bill paid by an expense: listed once, as the bill, with the
  // expense's PDF receipt.
  const { id: internet } = await one<{ id: string }>(
    `insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month)
     values ('user_a', 'Internet', 'Utilities', 9000, 15, '2026-01') returning id`,
    [],
  );
  ids.pdf = await fileReceipt("user_a", "pdf", "Shaw");
  const { id: paying } = await one<{ id: string }>(
    `insert into expenses (user_id, month, spent_on, description, category, amount_cents, receipt_id, fixed_item_id)
     values ('user_a', '2026-10', '2026-10-16', 'Shaw internet', 'Utilities', 9500, $1, $2) returning id`,
    [ids.pdf, internet],
  );
  await testPg().query(
    `insert into fixed_item_payments (user_id, fixed_item_id, month, paid_on, amount_cents, expense_id)
     values ('user_a', $1, '2026-10', '2026-10-16', 9500, $2)`,
    [internet, paying],
  );

  // A fixed bill marked paid before payments had a day: its due day counts.
  const { id: rent } = await one<{ id: string }>(
    `insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month)
     values ('user_a', 'Rent', 'Housing', 150000, 31, '2026-01') returning id`,
    [],
  );
  await testPg().query(
    `insert into fixed_item_payments (user_id, fixed_item_id, month) values ('user_a', $1, '2026-09'), ('user_a', $1, '2026-10')`,
    [rent],
  );

  // Outside the period, and someone else's.
  await insertExpense("user_a", {
    month: "2026-11",
    spentOn: "2026-11-01",
    description: "Next month",
    category: "Dining",
    amountCents: 100,
  });
  ids.other = await fileReceipt("user_b", "pdf", "Someone else");
  await testPg().query(
    `insert into expenses (user_id, month, spent_on, description, category, amount_cents, receipt_id)
     values ('user_b', '2026-10', '2026-10-05', 'Not mine', 'Dining', 99, $1)`,
    [ids.other],
  );

  const costco = await one<{ id: string }>(
    "select id from receipts where user_id = 'user_a' and merchant = 'Costco Wholesale'",
    [],
  );
  ids.photo = costco.id;
});

const short = (id: string) => id.replace(/-/g, "").slice(0, 8);

describe("GET /api/receipts/export", () => {
  it("answers 401 as JSON when signed out", async () => {
    signOut();
    const res = await manifest(`${OCTOBER}&${ALL_FORMATS}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({
      error: expect.stringContaining("signed out"),
    });
  });

  it("lists the summaries and every receipt copy in the period, once each", async () => {
    const res = await manifest(`${OCTOBER}&${ALL_FORMATS}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();

    expect(body.filename).toBe("expenditures-2026-10-01-to-2026-10-31.zip");
    expect(body.summaries.map((s: { url: string }) => s.url)).toEqual([
      `/api/receipts/export/summary?${OCTOBER}&format=csv`,
      `/api/receipts/export/summary?${OCTOBER}&format=xlsx`,
      `/api/receipts/export/summary?${OCTOBER}&format=pdf`,
    ]);
    // Two Costco parts, the phone case, the market, internet and October rent.
    expect(body.expenditureCount).toBe(6);
    expect(body.receipts).toEqual([
      {
        filename: `receipts/2026-10-05_Costco-Wholesale_${short(ids.photo)}.jpg`,
        url: `/api/receipts/${ids.photo}/file`,
      },
      {
        filename: `receipts/2026-10-10_Amazon_${short(ids.email)}.html`,
        url: `/api/receipts/${ids.email}/email`,
      },
      {
        filename: `receipts/2026-10-16_Shaw_${short(ids.pdf)}.pdf`,
        url: `/api/receipts/${ids.pdf}/file`,
      },
    ]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("receipts/user_");
    expect(text).not.toContain("Someone else");
  });

  it("keeps another user's receipts to themselves", async () => {
    signInAs("user_b");
    const body = await (await manifest(OCTOBER)).json();
    expect(body.summaries).toEqual([]);
    expect(body.expenditureCount).toBe(1);
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0].url).toBe(`/api/receipts/${ids.other}/file`);
  });

  it("filters by day", async () => {
    const body = await (
      await manifest("from=2026-10-10&to=2026-10-12&format=csv")
    ).json();
    expect(body.expenditureCount).toBe(2);
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0].filename).toContain("Amazon");
  });

  it("rejects bad choices with a JSON message", async () => {
    const backwards = await manifest("from=2026-10-31&to=2026-10-01");
    expect(backwards.status).toBe(400);
    expect(await backwards.json()).toEqual({
      error: "The start date must come before the end date",
    });
    const month = await manifest("from=2026-10&to=2026-10");
    expect(month.status).toBe(400);
  });

  it("answers past the limit with a JSON error, never a file", async () => {
    await testPg().exec(`
      with saved as (
        insert into receipts (user_id, merchant, image_pathname)
        select 'user_a', 'Bulk ' || n, 'receipts/user_a/bulk-' || n || '.jpg'
        from generate_series(1, ${MAX_EXPORT_RECEIPTS}) as n
        returning id
      )
      insert into expenses (user_id, month, spent_on, description, category, amount_cents, receipt_id)
      select 'user_a', '2026-08', '2026-08-01', 'Bulk', 'Groceries', 100, id from saved
    `);
    const res = await manifest("from=2026-08-01&to=2026-10-31");
    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await res.json()).toEqual({ error: tooManyReceiptsMessage() });

    // Exactly at the limit is fine.
    const atLimit = await manifest("from=2026-08-01&to=2026-08-31");
    expect(atLimit.status).toBe(200);
    expect((await atLimit.json()).receipts).toHaveLength(MAX_EXPORT_RECEIPTS);
  });
});

describe("GET /api/receipts/export/summary", () => {
  it("lists every expenditure as CSV, naming each receipt's file", async () => {
    const res = await summary(`${OCTOBER}&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="expenditures-2026-10-01-to-2026-10-31.csv"',
    );
    const lines = (await res.text()).split("\n");
    expect(lines[0]).toBe(
      "date,type,description,merchant,category,account,status,subtotal,tax,amount,receipt file",
    );
    const body = lines.join("\n");
    // The split receipt's tax is shared between its parts.
    const costcoFile = `receipts/2026-10-05_Costco-Wholesale_${short(ids.photo)}.jpg`;
    expect(lines.slice(1, 3).sort()).toEqual([
      `2026-10-05,Expense,Costco,Costco Wholesale,Groceries,,Paid,70.80,9.20,80.00,${costcoFile}`,
      `2026-10-05,Expense,Costco,Costco Wholesale,Health,,Paid,29.20,3.80,33.00,${costcoFile}`,
    ]);
    expect(body).toContain(
      `2026-10-10,Expense,Phone case,Amazon,Shopping,Chequing,Unpaid,,,25.00,receipts/2026-10-10_Amazon_${short(ids.email)}.html`,
    );
    expect(body).toContain("2026-10-12,Expense,Farmers market,,Groceries");
    // The bill and the expense that paid it are one line.
    expect(body).toContain(
      `2026-10-16,Fixed bill,Internet,Shaw,Utilities & Phone,,Paid,,,95.00,receipts/2026-10-16_Shaw_${short(ids.pdf)}.pdf`,
    );
    expect(body).not.toContain("Shaw internet");
    expect(body).toContain("2026-10-31,Fixed bill,Rent");
    expect(body).not.toContain("Next month");
    expect(body).not.toContain("Not mine");
    // 80 + 33 + 25 + 7 + 95 + 1500
    expect(lines.at(-1)).toBe("total,,,,All,,,,,1740.00");
  });

  it("builds the Excel and PDF versions", async () => {
    const xlsx = await summary(`${OCTOBER}&format=xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("Content-Type")).toContain("spreadsheetml");
    const xlsxBytes = new Uint8Array(await xlsx.arrayBuffer());
    expect([...xlsxBytes.slice(0, 2)]).toEqual([0x50, 0x4b]); // "PK"

    const pdf = await summary(`${OCTOBER}&format=pdf`);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");
  });

  it("is JSON on failure and private to its owner", async () => {
    const bad = await summary(`${OCTOBER}&format=docx`);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Pick a file type" });

    signOut();
    const out = await summary(`${OCTOBER}&format=csv`);
    expect(out.status).toBe(401);

    signInAs("user_b");
    const theirs = await (await summary(`${OCTOBER}&format=csv`)).text();
    expect(theirs).toContain("Not mine");
    expect(theirs).not.toContain("Costco");
  });
});
