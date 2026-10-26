import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExpense } from "@/actions/expenses";
import { approvePendingExpense } from "@/actions/pending-expenses";
import { unmarkBillPaid } from "@/dal/bill-payments";
import { selectPhotosInUse } from "@/db/receipt-cleanup";
import { selectBillReceipts } from "@/db/receipt-files";
import {
  deleteReceiptImage,
  putReceiptFile,
  putReceiptImage,
} from "@/lib/receipt-store";
import {
  addExpense,
  addFixedBill,
  attachReceipt,
  deleteExpense,
  listExpenses,
  type McpCaller,
  markBillPaid,
} from "@/mcp/tools";
import { rows } from "../../helpers/test-db";

/*
 * Receipts the AI sends from email: a JPEG, the PDF attachment, or the email
 * itself when there's no attachment, on expenses, pending items and fixed
 * bill payments. Files go to a mocked private store.
 */

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  putReceiptFile: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Muse" };

const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString(
  "base64",
);
const PDF = "%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n";
const PDF_BASE64 = Buffer.from(PDF).toString("base64");
const OTHER_PDF_BASE64 = Buffer.from(`${PDF}% another\n`).toString("base64");

const email = {
  message_id: "<Bill-1042@rogers.com>",
  subject: "Your Rogers bill is ready",
  from: "Rogers <billing@rogers.com>",
  date: "2026-10-20",
};

const emailBody = {
  ...email,
  html: `<p>Amount due: <b>$85.00</b></p><script>alert(1)</script><img src="https://track.rogers.com/open.gif"><a href="https://rogers.com/pay">Pay</a>`,
};

const order = {
  amount: 85,
  date: "2026-10-20",
  merchant: "Rogers",
  category: "Utilities",
  is_subscription: false,
  source: "billing@rogers.com: Your Rogers bill is ready",
};

/** What the last file upload stored, as text. */
async function lastFile() {
  const call = vi.mocked(putReceiptFile).mock.calls.at(-1);
  if (!call) throw new Error("no file stored");
  const [pathname, blob, contentType] = call;
  return { pathname, contentType, text: await blob.text() };
}

async function savedExpense(description = "Rogers") {
  await createExpense({
    description,
    category: "Utilities",
    amount: "85.00",
    spentOn: "2026-10-20",
  });
  const [row] = await rows(
    `select id from expenses where description = '${description}'`,
  );
  return String(row?.id);
}

async function approveAll() {
  for (const row of await rows("select id from pending_expenses")) {
    expect(await approvePendingExpense(String(row.id))).toEqual({ ok: true });
  }
}

beforeEach(() => {
  vi.mocked(putReceiptImage).mockClear();
  vi.mocked(putReceiptFile).mockClear();
  vi.mocked(deleteReceiptImage).mockClear();
});

describe("add_expense receipts", () => {
  it("still stores a JPEG and its details", async () => {
    const added = await addExpense(A, {
      ...order,
      receipt: { total: 85, image_jpeg_base64: JPEG_BASE64 },
    });
    expect(added.data).toMatchObject({
      status: "pending_review",
      has_receipt: true,
      receipt_kind: "photo",
    });
    expect(putReceiptImage).toHaveBeenCalledTimes(1);
    expect(putReceiptFile).not.toHaveBeenCalled();
    await approveAll();
    expect(
      await rows(
        "select total_cents, file_kind, image_pathname like 'receipts/user_a/%.jpg' as photo from receipts",
      ),
    ).toEqual([{ total_cents: 8500, file_kind: null, photo: true }]);
  });

  it("saves the email's PDF attachment, and approving keeps it", async () => {
    const added = await addExpense(A, {
      ...order,
      receipt: {
        total: 85,
        pdf_base64: PDF_BASE64,
        pdf_filename: "Rogers-Oct.pdf",
        email: { ...email, html: "<p>ignored: there's an attachment</p>" },
      },
    });
    expect(added.data).toMatchObject({ receipt_kind: "pdf" });
    expect(added.summary).toContain("receipt PDF");

    const stored = await lastFile();
    expect(stored.pathname).toMatch(/^receipts\/user_a\/[0-9a-f-]{36}\.pdf$/);
    expect(stored.contentType).toBe("application/pdf");
    expect(stored.text).toBe(PDF);
    expect(putReceiptFile).toHaveBeenCalledTimes(1);

    await approveAll();
    expect(
      await rows(
        `select file_pathname, file_kind, file_name, file_bytes, email_subject,
                email_from, email_date, email_message_id,
                length(content_hash) as hash_length
         from receipts`,
      ),
    ).toEqual([
      {
        file_pathname: stored.pathname,
        file_kind: "pdf",
        file_name: "Rogers-Oct.pdf",
        file_bytes: PDF.length,
        email_subject: "Your Rogers bill is ready",
        email_from: "Rogers <billing@rogers.com>",
        email_date: "2026-10-20",
        email_message_id: "bill-1042@rogers.com",
        hash_length: 64,
      },
    ]);
    const listed = await listExpenses(A, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(listed.data.expenses).toMatchObject([
      { has_receipt: true, receipt_kind: "pdf" },
    ]);
  });

  it("saves the email itself, sanitized, when there's no attachment", async () => {
    const added = await addExpense(A, {
      ...order,
      receipt: { total: 85, email: emailBody },
    });
    expect(added.data).toMatchObject({ receipt_kind: "email" });

    const stored = await lastFile();
    expect(stored.pathname).toMatch(/\.html$/);
    expect(stored.contentType).toBe("text/html; charset=utf-8");
    expect(stored.text).toContain("Your Rogers bill is ready");
    expect(stored.text).toContain("Amount due: <b>$85.00</b>");
    expect(stored.text).toContain('href="https://rogers.com/pay"');
    expect(stored.text).not.toContain("<script");
    expect(stored.text).not.toContain("alert(1)");
    expect(stored.text).not.toContain("track.rogers.com");

    const [pending] = await rows(
      "select receipt->>'file_kind' as kind, receipt->>'file_pathname' as path from pending_expenses",
    );
    expect(pending).toEqual({ kind: "email", path: stored.pathname });
  });

  it("saves a plain-text email", async () => {
    await addExpense(A, {
      ...order,
      receipt: { email: { ...email, text: "Paid $85.00. Thanks!" } },
    });
    expect((await lastFile()).text).toContain(
      "<pre>Paid $85.00. Thanks!</pre>",
    );
  });

  it("answers possible_duplicate for an email already saved, storing nothing", async () => {
    await addExpense(A, { ...order, receipt: { total: 85, email: emailBody } });
    vi.mocked(putReceiptFile).mockClear();

    // Same email, read on another day for another amount: still the same receipt.
    const again = await addExpense(A, {
      ...order,
      amount: 86,
      date: "2026-10-21",
      receipt: { email: { message_id: "bill-1042@ROGERS.com" }, total: 86 },
    });
    expect(again.data).toMatchObject({
      status: "possible_duplicate",
      match: { kind: "pending" },
    });
    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(await rows("select id from pending_expenses")).toHaveLength(1);

    // Once approved it's an expense, and still a duplicate.
    await approveAll();
    const third = await addExpense(A, {
      ...order,
      amount: 87,
      date: "2026-10-22",
      receipt: { total: 87, email: emailBody },
    });
    expect(third.data).toMatchObject({
      status: "possible_duplicate",
      match: { kind: "expense" },
    });

    // Another user's identical email is theirs to add.
    const other = await addExpense(B, {
      ...order,
      receipt: { total: 85, email: emailBody },
    });
    expect(other.data).toMatchObject({ status: "pending_review" });
  });
});

describe("rejected receipts", () => {
  it("refuses a file that isn't a PDF", async () => {
    const result = await addExpense(A, {
      ...order,
      receipt: { pdf_base64: Buffer.from("<html>").toString("base64") },
    });
    expect(result.isError).toBe(true);
    expect(result.summary).toContain("isn't a PDF");
    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(await rows("select * from pending_expenses")).toHaveLength(0);
  });

  it("refuses a PDF over 3MB, and one too big to send", async () => {
    const big = Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      Buffer.alloc(3 * 1024 * 1024),
    ]).toString("base64");
    const result = await addExpense(A, {
      ...order,
      receipt: { pdf_base64: big },
    });
    expect(result.isError).toBe(true);
    expect(result.summary).toContain("larger than 3MB");

    await expect(
      addExpense(A, {
        ...order,
        receipt: { pdf_base64: "A".repeat(4_200_001) },
      }),
    ).rejects.toThrow();
    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(await rows("select * from pending_expenses")).toHaveLength(0);
  });

  it("refuses an email too big to send", async () => {
    await expect(
      addExpense(A, {
        ...order,
        receipt: { email: { html: "x".repeat(1_000_001) } },
      }),
    ).rejects.toThrow();
    expect(putReceiptFile).not.toHaveBeenCalled();
  });

  it("refuses two copies at once", async () => {
    const id = await savedExpense();
    const result = await attachReceipt(A, {
      expense_id: id,
      pdf_base64: PDF_BASE64,
      image_jpeg_base64: JPEG_BASE64,
    });
    expect(result.isError).toBe(true);
    expect(result.summary).toContain("not both");
    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(putReceiptImage).not.toHaveBeenCalled();
  });

  it("refuses an empty receipt, even with an email header only", async () => {
    const id = await savedExpense();
    const result = await attachReceipt(A, {
      expense_id: id,
      email: { subject: "Hi" },
    });
    expect(result.isError).toBe(true);
    expect(result.summary).toContain("empty");
  });
});

describe("attach_receipt", () => {
  it("attaches a PDF to a saved expense, and re-attaching it changes nothing", async () => {
    const id = await savedExpense();
    const receipt = {
      expense_id: id,
      total: 85,
      pdf_base64: PDF_BASE64,
      email,
    };
    const first = await attachReceipt(A, receipt);
    expect(first.data).toMatchObject({
      kind: "expense",
      status: "attached",
      receipt_kind: "pdf",
      has_file: true,
    });
    const again = await attachReceipt(A, receipt);
    expect(again.data).toMatchObject({ status: "already_attached" });
    expect(again.isError).toBeUndefined();
    expect(putReceiptFile).toHaveBeenCalledTimes(1);
    expect(deleteReceiptImage).not.toHaveBeenCalled();
    expect(await rows("select id from receipts")).toHaveLength(1);
  });

  it("knows the same email by Message-ID, however it's written", async () => {
    const id = await savedExpense();
    await attachReceipt(A, { expense_id: id, total: 85, email: emailBody });
    const again = await attachReceipt(A, {
      expense_id: id,
      total: 85,
      email: { ...emailBody, message_id: "  <BILL-1042@rogers.com> " },
    });
    expect(again.data).toMatchObject({ status: "already_attached" });
    expect(putReceiptFile).toHaveBeenCalledTimes(1);
  });

  it("replaces a receipt with a different file and removes the old one", async () => {
    const id = await savedExpense();
    await attachReceipt(A, {
      expense_id: id,
      pdf_base64: PDF_BASE64,
      email,
    });
    const { pathname: first } = await lastFile();
    const second = await attachReceipt(A, {
      expense_id: id,
      pdf_base64: OTHER_PDF_BASE64,
      email,
    });
    expect(second.data).toMatchObject({ status: "attached", replaced: true });
    expect(deleteReceiptImage).toHaveBeenCalledWith(first);
    expect(await rows("select id from receipts")).toHaveLength(1);
  });

  it("swaps a photo for the email and removes the photo", async () => {
    const id = await savedExpense();
    await attachReceipt(A, {
      expense_id: id,
      image_jpeg_base64: JPEG_BASE64,
    });
    const [photo] = vi.mocked(putReceiptImage).mock.calls[0] ?? [];
    await attachReceipt(A, { expense_id: id, email: emailBody });
    expect(deleteReceiptImage).toHaveBeenCalledWith(photo);
    expect(
      await rows("select image_pathname, file_kind from receipts"),
    ).toEqual([{ image_pathname: null, file_kind: "email" }]);
  });

  it("attaches the email to an item waiting for review, once", async () => {
    const { data } = await addExpense(A, order);
    const receipt = {
      pending_id: String(data.id),
      total: 85,
      email: emailBody,
    };
    expect((await attachReceipt(A, receipt)).data).toMatchObject({
      kind: "pending",
      status: "attached",
      receipt_kind: "email",
    });
    expect((await attachReceipt(A, receipt)).data).toMatchObject({
      status: "already_attached",
    });
    expect(putReceiptFile).toHaveBeenCalledTimes(1);
  });

  it("attaches to a fixed bill's payment, once", async () => {
    const bill = await addFixedBill(A, {
      name: "Internet",
      category: "Utilities",
      amount: 85,
      start_month: "2026-10",
    });
    const billId = String(bill.data.id);

    const unpaid = await attachReceipt(A, {
      fixed_bill_id: billId,
      month: "2026-10",
      pdf_base64: PDF_BASE64,
    });
    expect(unpaid.isError).toBe(true);
    expect(unpaid.summary).toContain("mark_bill_paid");
    expect(putReceiptFile).not.toHaveBeenCalled();

    await markBillPaid(A, {
      id: billId,
      month: "2026-10",
      paid_on: "2026-10-20",
    });
    const receipt = {
      fixed_bill_id: billId,
      month: "2026-10",
      total: 85,
      pdf_base64: PDF_BASE64,
      pdf_filename: "internet.pdf",
      email,
    };
    expect((await attachReceipt(A, receipt)).data).toMatchObject({
      kind: "fixed_bill_payment",
      fixed_bill_id: billId,
      month: "2026-10",
      status: "attached",
      receipt_kind: "pdf",
    });
    expect((await attachReceipt(A, receipt)).data).toMatchObject({
      status: "already_attached",
    });
    expect(putReceiptFile).toHaveBeenCalledTimes(1);

    const receipts = await selectBillReceipts("user_a", "2026-10");
    expect(receipts.get(billId)).toMatchObject({ kind: "pdf" });
    expect(await selectBillReceipts("user_b", "2026-10")).toEqual(new Map());

    // Unmarking the payment takes its receipt with it.
    await unmarkBillPaid({ fixedItemId: billId, month: "2026-10" });
    expect(await rows("select id from receipts")).toHaveLength(0);
  });

  it("puts a bill payment's receipt on the expense that paid it", async () => {
    const bill = await addFixedBill(A, {
      name: "Internet",
      category: "Utilities",
      amount: 85,
      start_month: "2026-10",
    });
    const billId = String(bill.data.id);
    const expenseId = await savedExpense();
    await markBillPaid(A, {
      id: billId,
      month: "2026-10",
      expense_id: expenseId,
    });

    const result = await attachReceipt(A, {
      fixed_bill_id: billId,
      month: "2026-10",
      email: emailBody,
    });
    expect(result.data).toMatchObject({ kind: "expense", id: expenseId });
    expect(
      await rows("select receipt_id is not null as has from expenses"),
    ).toEqual([{ has: true }]);
    expect(
      (await selectBillReceipts("user_a", "2026-10")).get(billId),
    ).toMatchObject({ kind: "email" });
  });

  it("can't attach to another user's expense, pending item or bill", async () => {
    const id = await savedExpense();
    const { data } = await addExpense(A, { ...order, date: "2026-10-21" });
    const bill = await addFixedBill(A, {
      name: "Internet",
      category: "Utilities",
      amount: 85,
      start_month: "2026-10",
    });
    await markBillPaid(A, {
      id: String(bill.data.id),
      month: "2026-10",
      paid_on: "2026-10-20",
    });

    for (const target of [
      { expense_id: id },
      { pending_id: String(data.id) },
      { fixed_bill_id: String(bill.data.id), month: "2026-10" },
    ]) {
      const result = await attachReceipt(B, {
        ...target,
        pdf_base64: PDF_BASE64,
      });
      expect(result.isError, JSON.stringify(target)).toBe(true);
    }
    expect(putReceiptFile).not.toHaveBeenCalled();
    expect(await rows("select id from receipts")).toHaveLength(0);
  });
});

describe("receipt files over their lifetime", () => {
  it("are kept by the cleanup job while something uses them", async () => {
    await addExpense(A, { ...order, receipt: { pdf_base64: PDF_BASE64 } });
    const { pathname: pending } = await lastFile();
    const id = await savedExpense("Shell");
    await attachReceipt(A, { expense_id: id, email: emailBody });
    const { pathname: saved } = await lastFile();
    const unused = "receipts/user_a/00000000-0000-4000-8000-000000000000.pdf";

    expect(await selectPhotosInUse([pending, saved, unused], 10)).toEqual(
      new Set([pending, saved]),
    );
  });

  it("are removed with the expense", async () => {
    const id = await savedExpense();
    await attachReceipt(A, { expense_id: id, pdf_base64: PDF_BASE64 });
    const { pathname } = await lastFile();
    await deleteExpense(A, { id });
    expect(deleteReceiptImage).toHaveBeenCalledWith(pathname);
  });
});
