import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as scan } from "@/app/api/receipts/route";
import { POST as upload } from "@/app/api/receipts/upload/route";
import { insertAccount } from "@/db/accounts";
import { insertExpense } from "@/db/expenses";
import { putReceiptFile, putReceiptImage } from "@/lib/receipt-store";
import { putStatementPdf } from "@/lib/statement-store";
import { recordStatement } from "@/mcp/account-tools";
import { addExpense, attachReceipt, type McpCaller } from "@/mcp/tools";
import { rows } from "./../helpers/test-db";

/*
 * The daily upload budget every Blob write path shares: the photo scan, the
 * receipt upload (readable or not) and the MCP tools that save a receipt or
 * statement PDF. A refused upload answers 429 (routes) or a tool error (MCP)
 * and stores nothing.
 */

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  putReceiptFile: vi.fn(),
  readReceiptFile: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));
vi.mock("@/lib/statement-store", () => ({
  putStatementPdf: vi.fn(),
  deleteStatementPdf: vi.fn(),
}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(async () => {
    throw new Error("not on Vercel");
  }),
}));

const A: McpCaller = { userId: "user_a", client: "Claude" };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const PDF_BASE64 = Buffer.from("%PDF-1.7\nstatement\n%%EOF\n").toString(
  "base64",
);

async function expenseOf(userId: string) {
  await insertExpense(userId, {
    month: "2026-08",
    spentOn: "2026-08-18",
    description: "Esprit Moto levers",
    category: "Auto",
    amountCents: 100,
  });
  const [row] = await rows(
    "select id from expenses where user_id = $1 order by created_at desc limit 1",
    [userId],
  );
  return String(row?.id);
}

function sendFile(expenseId: string, bytes: Uint8Array, name: string) {
  const body = new FormData();
  body.append("expenseId", expenseId);
  body.append("file", new File([new Uint8Array(bytes)], name));
  return upload(
    new Request("https://budget.test/api/receipts/upload", {
      method: "POST",
      body,
    }),
  );
}

function scanPhoto() {
  const body = new FormData();
  body.append("file", new Blob([JPEG], { type: "image/jpeg" }), "r.jpg");
  return scan(
    new Request("https://budget.test/api/receipts", { method: "POST", body }),
  );
}

const used = async () =>
  rows("select user_id, count, bytes::integer from receipt_upload_counts");

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("RECEIPT_UPLOADS_PER_DAY", "2");
  vi.mocked(putReceiptImage).mockClear();
  vi.mocked(putReceiptFile).mockClear();
  vi.mocked(putStatementPdf).mockClear();
});

describe("POST /api/receipts/upload", () => {
  it("counts files the reader can't open, and refuses past the day's budget with 429", async () => {
    const id = await expenseOf("user_a");
    expect((await sendFile(id, DOCX, "a.docx")).status).toBe(200);
    expect((await sendFile(id, DOCX, "b.docx")).status).toBe(200);
    expect(putReceiptFile).toHaveBeenCalledTimes(2);
    vi.mocked(putReceiptFile).mockClear();

    const refused = await sendFile(id, DOCX, "c.docx");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await refused.json()).toEqual({
      error: expect.stringMatching(/tomorrow/),
      limited: true,
    });
    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(await used()).toEqual([
      { user_id: "user_a", count: 2, bytes: DOCX.length * 2 },
    ]);
  });

  it("refuses by bytes too", async () => {
    vi.stubEnv("RECEIPT_UPLOAD_BYTES_PER_DAY", String(DOCX.length));
    const id = await expenseOf("user_a");
    expect((await sendFile(id, DOCX, "a.docx")).status).toBe(200);
    const refused = await sendFile(id, DOCX, "b.docx");
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toMatch(/today's limit/);
    expect(putReceiptFile).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/receipts", () => {
  it("shares the budget with uploads and stores nothing when refused", async () => {
    const id = await expenseOf("user_a");
    await sendFile(id, DOCX, "a.docx");
    expect((await scanPhoto()).status).toBe(200);
    expect(putReceiptImage).toHaveBeenCalledTimes(1);
    vi.mocked(putReceiptImage).mockClear();

    const refused = await scanPhoto();
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(putReceiptImage).not.toHaveBeenCalled();
  });
});

describe("MCP tools", () => {
  const order = {
    amount: 85,
    date: "2026-10-20",
    merchant: "Rogers",
    category: "Utilities",
    is_subscription: false,
  };
  const receipt = (n: number) => ({
    total: 85,
    email: { message_id: `<bill-${n}@rogers.com>`, html: `<p>Bill ${n}</p>` },
  });

  it("add_expense and attach_receipt refuse past the budget and save nothing", async () => {
    const id = await expenseOf("user_a");
    expect(
      (await addExpense(A, { ...order, receipt: receipt(1) })).isError,
    ).toBeFalsy();
    expect(
      (await attachReceipt(A, { expense_id: id, ...receipt(2) })).isError,
    ).toBeFalsy();
    expect(putReceiptFile).toHaveBeenCalledTimes(2);
    vi.mocked(putReceiptFile).mockClear();

    const added = await addExpense(A, {
      ...order,
      amount: 90,
      receipt: receipt(3),
    });
    expect(added.isError).toBe(true);
    expect(added.summary).toMatch(/^Nothing was saved.*limit/);
    const attached = await attachReceipt(A, { expense_id: id, ...receipt(4) });
    expect(attached.isError).toBe(true);

    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(await rows("select id from pending_expenses")).toHaveLength(1);
  });

  it("add_expense with details only and no copy still works when refused", async () => {
    vi.stubEnv("RECEIPT_UPLOADS_PER_DAY", "1");
    await addExpense(A, { ...order, receipt: receipt(1) });
    const added = await addExpense(A, {
      ...order,
      amount: 90,
      receipt: { total: 90 },
    });
    expect(added.isError).toBeFalsy();
  });

  it("record_statement refuses its PDF past the budget and records nothing", async () => {
    vi.stubEnv("RECEIPT_UPLOADS_PER_DAY", "1");
    await insertAccount("user_a", {
      type: "credit_card",
      name: "RBC Visa",
      institution: "RBC Royal Bank",
      lastFour: "1234",
      balanceCents: 30_000,
      balanceSource: "manual",
      creditLimitCents: 500_000,
      availableCreditCents: null,
      statementBalanceCents: null,
      paymentDueDate: null,
      minimumPaymentCents: null,
    });
    const statement = {
      institution: "RBC",
      last_four: "1234",
      balance: 842.19,
      pdf_base64: PDF_BASE64,
    };
    const first = await recordStatement(A, {
      ...statement,
      closing_date: "2026-09-15",
    });
    expect(first.data).toMatchObject({ status: "recorded", has_pdf: true });

    const second = await recordStatement(A, {
      ...statement,
      closing_date: "2026-10-15",
    });
    expect(second.isError).toBe(true);
    expect(second.summary).toMatch(/^Nothing was saved/);
    expect(putStatementPdf).toHaveBeenCalledTimes(1);
    expect(await rows("select id from account_statements")).toHaveLength(1);
  });
});
