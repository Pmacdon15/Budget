import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvePendingExpense } from "@/actions/pending-expenses";
import { approvePendingIncome } from "@/actions/pending-income";
import ExpensesPage from "@/app/(app)/expenses/page";
import FixedPage from "@/app/(app)/fixed/page";
import IncomePage from "@/app/(app)/income/page";
import ReviewPage from "@/app/(app)/review/page";
import { GET as getEmail } from "@/app/api/receipts/[id]/email/route";
import { GET as getFile } from "@/app/api/receipts/[id]/file/route";
import { GET as getImage } from "@/app/api/receipts/[id]/image/route";
import { GET as getPendingEmail } from "@/app/api/receipts/pending/[id]/email/route";
import { GET as getPendingFile } from "@/app/api/receipts/pending/[id]/file/route";
import { addIncome } from "@/mcp/income-tools";
import {
  addExpense,
  addFixedBill,
  attachReceipt,
  type McpCaller,
  markBillPaid,
} from "@/mcp/tools";
import { signInAs } from "../helpers/auth";
import { renderPage, searchParams } from "../helpers/render-page";
import { rows } from "../helpers/test-db";

/*
 * A receipt the MCP connector saves from an email, end to end: the AI sends
 * a PDF, a JPEG, or the email itself (HTML or plain text); Budget stores it;
 * the item shows the receipt's links; and the route hands back exactly the
 * file that was sent, with the right type and name.
 *
 * The blob store is an in-memory fake that answers the way Vercel's does
 * for a compressible file: `fetch` has already decompressed the body, so the
 * size the SDK reports (from the compressed response) is wrong. Serving that
 * size on is what cut PDFs and emails short.
 */

const store = vi.hoisted(
  () => new Map<string, { bytes: Uint8Array; contentType: string }>(),
);

vi.mock("@vercel/blob", () => ({
  put: vi.fn(
    async (pathname: string, body: Blob, options: { contentType?: string }) => {
      store.set(pathname, {
        bytes: new Uint8Array(await body.arrayBuffer()),
        contentType: options.contentType ?? "application/octet-stream",
      });
      return { pathname };
    },
  ),
  get: vi.fn(async (pathname: string) => {
    const saved = store.get(pathname);
    if (!saved) return null;
    return {
      statusCode: 200,
      stream: new Blob([new Uint8Array(saved.bytes)]).stream(),
      // A compressed answer has no usable length: the SDK reports 0.
      blob: { contentType: saved.contentType, size: 0 },
    };
  }),
  del: vi.fn(async (pathnames: string | string[]) => {
    for (const p of [pathnames].flat()) store.delete(p);
  }),
  list: vi.fn(async () => ({ blobs: [], hasMore: false })),
}));

const A: McpCaller = { userId: "user_a", client: "Claude" };

const email = {
  message_id: "<order-42@shop.example>",
  subject: "Your order receipt #42",
  from: "Shop <orders@shop.example>",
  date: "2026-10-20",
};

const order = {
  amount: 42.5,
  date: "2026-10-20",
  merchant: "Shop",
  category: "Personal",
  is_subscription: false,
};

/** A real, one-page PDF, the way a shop's invoice attachment is. */
async function invoicePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Invoice 42 - Total $42.50", { x: 20, y: 150, size: 12, font });
  return new Uint8Array(await doc.save());
}

/** A tiny JPEG: just the markers Budget checks for. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

const asParams = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (path: string) => new Request(`https://budget.test${path}`);

async function approveAll() {
  for (const row of await rows("select id from pending_expenses")) {
    expect(await approvePendingExpense(String(row.id))).toEqual({ ok: true });
  }
}

async function onlyReceiptId() {
  const [row] = await rows("select id from receipts");
  return String(row?.id);
}

const bytesOf = async (response: Response) =>
  new Uint8Array(await response.arrayBuffer());

const spending = () =>
  renderPage(ExpensesPage({ searchParams: searchParams("2026-10") }));

beforeEach(() => {
  store.clear();
  signInAs("user_a");
});

describe("a PDF receipt from email", () => {
  it("round-trips: base64 in, the same valid PDF out, with a .pdf name", async () => {
    const pdf = await invoicePdf();
    const added = await addExpense(A, {
      ...order,
      receipt: {
        total: 42.5,
        pdf_base64: Buffer.from(pdf).toString("base64"),
        pdf_filename: "Invoice-42.pdf",
        email,
      },
    });
    expect(added.data).toMatchObject({ receipt_kind: "pdf" });
    await approveAll();
    const id = await onlyReceiptId();

    // Spending shows the PDF's view and download links.
    const html = await spending();
    expect(html).toContain(`href="/api/receipts/${id}/file"`);
    expect(html).toContain(`href="/api/receipts/${id}/file?download=1"`);
    expect(html).toContain("Download receipt PDF for Shop");

    const response = await getFile(
      url(`/api/receipts/${id}/file?download=1`),
      asParams(id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="Invoice-42.pdf"',
    );
    const served = await bytesOf(response);
    expect(response.headers.get("Content-Length")).toBe(String(pdf.length));
    expect(served).toEqual(pdf);
    // It opens as a PDF.
    const doc = await PDFDocument.load(served);
    expect(doc.getPageCount()).toBe(1);
  });

  it("takes the shapes AI apps send base64 in", async () => {
    const pdf = await invoicePdf();
    const base64 = Buffer.from(pdf).toString("base64");
    const shapes = {
      "data URL": `data:application/pdf;base64,${base64}`,
      base64url: Buffer.from(pdf).toString("base64url"),
      "line-wrapped (MIME)": base64.replace(/(.{76})/g, "$1\r\n"),
      "encoded twice": Buffer.from(base64).toString("base64"),
    };
    for (const [shape, value] of Object.entries(shapes)) {
      store.clear();
      await rows("delete from pending_expenses");
      const added = await addExpense(A, {
        ...order,
        description: shape,
        allow_duplicate: true,
        receipt: { total: 42.5, pdf_base64: value },
      });
      expect(added.isError, shape).toBeFalsy();
      expect(added.data.receipt_kind, shape).toBe("pdf");
      const [saved] = [...store.values()];
      expect(saved?.bytes, shape).toEqual(pdf);
    }
  });

  it("shows and downloads on Review before it's approved", async () => {
    const pdf = await invoicePdf();
    const added = await addExpense(A, {
      ...order,
      receipt: { pdf_base64: Buffer.from(pdf).toString("base64"), email },
    });
    const pendingId = String(added.data.id);
    const html = await renderPage(
      ReviewPage({ searchParams: searchParams("2026-10") }),
    );
    expect(html).toContain(`href="/api/receipts/pending/${pendingId}/file"`);
    expect(html).toContain("Download receipt PDF for Shop");

    const response = await getPendingFile(
      url(`/api/receipts/pending/${pendingId}/file?download=1`),
      asParams(pendingId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Length")).toBe(String(pdf.length));
    expect(await bytesOf(response)).toEqual(pdf);
  });

  it("goes on a fixed bill's payment and downloads from Fixed bills", async () => {
    const pdf = await invoicePdf();
    const bill = await addFixedBill(A, {
      name: "Internet",
      category: "Utilities",
      amount: 85,
      start_month: "2026-10",
    });
    const billId = String(bill.data.id);
    await markBillPaid(A, {
      id: billId,
      month: "2026-10",
      paid_on: "2026-10-20",
    });
    const attached = await attachReceipt(A, {
      fixed_bill_id: billId,
      month: "2026-10",
      pdf_base64: Buffer.from(pdf).toString("base64"),
      pdf_filename: "internet-oct.pdf",
      email,
    });
    expect(attached.data).toMatchObject({
      status: "attached",
      receipt_kind: "pdf",
    });
    const id = await onlyReceiptId();

    const html = await renderPage(
      FixedPage({ searchParams: searchParams("2026-10") }),
    );
    expect(html).toContain(`href="/api/receipts/${id}/file?download=1"`);
    const response = await getFile(
      url(`/api/receipts/${id}/file`),
      asParams(id),
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      'inline; filename="internet-oct.pdf"',
    );
    expect(await bytesOf(response)).toEqual(pdf);
  });

  it("saves the email instead when the PDF sent isn't one, and says so", async () => {
    const added = await addExpense(A, {
      ...order,
      receipt: {
        pdf_base64: Buffer.from("<html>not a pdf</html>").toString("base64"),
        email: { ...email, html: "<p>Total: <b>$42.50</b></p>" },
      },
    });
    expect(added.isError).toBeFalsy();
    expect(added.data.receipt_kind).toBe("email");
    expect(added.summary).toContain("isn't a PDF");
    expect(added.summary).toContain("The email itself was saved");
  });
});

describe("an email receipt (no attachment)", () => {
  it("round-trips the sanitized HTML, with a .html name and its links", async () => {
    await addExpense(A, {
      ...order,
      receipt: {
        total: 42.5,
        email: {
          ...email,
          html: `<p>Total: <b>$42.50</b></p><script>alert(1)</script><img src="https://track.example/open.gif">`,
        },
      },
    });
    await approveAll();
    const id = await onlyReceiptId();

    const html = await spending();
    expect(html).toContain(`href="/api/receipts/${id}/email"`);
    expect(html).toContain(`href="/api/receipts/${id}/email?download=1"`);
    expect(html).toContain("View receipt email for Shop");

    const response = await getEmail(
      url(`/api/receipts/${id}/email?download=1`),
      asParams(id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="Your order receipt 42.html"',
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox",
    );
    const body = await bytesOf(response);
    expect(response.headers.get("Content-Length")).toBe(String(body.length));
    const text = new TextDecoder().decode(body);
    expect(text).toContain("<b>$42.50</b>");
    expect(text).toContain("Your order receipt #42");
    expect(text).not.toContain("<script");
    expect(text).not.toContain("track.example");
    expect(text.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("round-trips a plain-text email on Review and Take-home", async () => {
    const added = await addIncome(A, {
      amount: 1450,
      date: "2026-10-14",
      payer: "DRIFT LANDSCAPING LTD",
      receipt: {
        total: 1450,
        email: { ...email, text: "DRIFT LANDSCAPING LTD sent you $1,450.00" },
      },
    });
    const pendingId = String(added.data.id);
    const review = await renderPage(
      ReviewPage({ searchParams: searchParams("2026-10") }),
    );
    expect(review).toContain(`href="/api/receipts/pending/${pendingId}/email"`);
    const pending = await getPendingEmail(
      url(`/api/receipts/pending/${pendingId}/email?download=1`),
      asParams(pendingId),
    );
    expect(pending.status).toBe(200);
    expect(new TextDecoder().decode(await bytesOf(pending))).toContain(
      "sent you $1,450.00",
    );

    expect(await approvePendingIncome(pendingId)).toEqual({ ok: true });
    const id = await onlyReceiptId();
    const income = await renderPage(
      IncomePage({ searchParams: searchParams("2026-10") }),
    );
    expect(income).toContain(`href="/api/receipts/${id}/email?download=1"`);
    const saved = await getEmail(
      url(`/api/receipts/${id}/email`),
      asParams(id),
    );
    expect(saved.status).toBe(200);
    expect(new TextDecoder().decode(await bytesOf(saved))).toContain(
      "sent you $1,450.00",
    );
  });
});

describe("a JPEG receipt", () => {
  it("round-trips, opening at its image route and downloading as .jpg", async () => {
    await addExpense(A, {
      ...order,
      receipt: {
        merchant: "Shop",
        total: 42.5,
        image_jpeg_base64: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
      },
    });
    await approveAll();
    const id = await onlyReceiptId();

    const html = await spending();
    expect(html).toContain(`href="/api/receipts/${id}/image"`);
    expect(html).toContain(`href="/api/receipts/${id}/file?download=1"`);

    const image = await getImage(
      url(`/api/receipts/${id}/image`),
      asParams(id),
    );
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    expect(image.headers.get("Content-Length")).toBe(String(JPEG.length));
    expect(await bytesOf(image)).toEqual(JPEG);

    const download = await getFile(
      url(`/api/receipts/${id}/file?download=1`),
      asParams(id),
    );
    expect(download.headers.get("Content-Disposition")).toContain(
      'filename="Shop.jpg"',
    );
    expect(await bytesOf(download)).toEqual(JPEG);
  });
});

describe("receipts saved before this fix", () => {
  it("serve intact without being saved again, even a PDF stored base64-encoded", async () => {
    const pdf = await invoicePdf();
    const path = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b.pdf";
    store.set(path, {
      bytes: new TextEncoder().encode(Buffer.from(pdf).toString("base64")),
      contentType: "application/pdf",
    });
    const [row] = await rows(
      `insert into receipts (user_id, file_pathname, file_kind, file_name)
       values ('user_a', '${path}', 'pdf', 'old.pdf') returning id`,
    );
    const id = String(row?.id);
    const response = await getFile(
      url(`/api/receipts/${id}/file`),
      asParams(id),
    );
    expect(response.status).toBe(200);
    expect(await bytesOf(response)).toEqual(pdf);
  });

  it("is a 404, not a broken file, when what's stored is empty or not a PDF", async () => {
    const path = "receipts/user_a/6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b.pdf";
    const [row] = await rows(
      `insert into receipts (user_id, file_pathname, file_kind)
       values ('user_a', '${path}', 'pdf') returning id`,
    );
    const id = String(row?.id);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bytes of [
      new Uint8Array(),
      new TextEncoder().encode("<html>"),
    ]) {
      store.set(path, { bytes, contentType: "application/pdf" });
      const response = await getFile(
        url(`/api/receipts/${id}/file`),
        asParams(id),
      );
      expect(response.status).toBe(404);
    }
    expect(error).toHaveBeenCalled();
  });
});
