import { get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getFile } from "@/app/api/receipts/[id]/file/route";
import { POST as upload } from "@/app/api/receipts/upload/route";
import { insertExpense } from "@/db/expenses";
import type * as ReceiptStore from "@/lib/receipt-store";
import { putReceiptFile, putReceiptImage } from "@/lib/receipt-store";
import { signInAs, signOut } from "./../helpers/auth";
import { rows } from "./../helpers/test-db";

/*
 * Uploading a file as an expense's receipt: what's kept, how it's served,
 * and what the AI read off it for the user to confirm.
 */

vi.mock("@/lib/receipt-store", async (importOriginal) => ({
  readReceiptFile: (await importOriginal<typeof ReceiptStore>())
    .readReceiptFile,
  putReceiptImage: vi.fn(),
  putReceiptFile: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ get: vi.fn() }));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(async () => {
    throw new Error("not on Vercel");
  }),
}));

const PDF = new TextEncoder().encode("%PDF-1.7\nFacture\n%%EOF\n");
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

async function expenseOf(userId: string, amountCents = 100) {
  await insertExpense(userId, {
    month: "2026-08",
    spentOn: "2026-08-18",
    description: "Esprit Moto levers",
    category: "Auto",
    amountCents,
  });
  const [row] = await rows(
    "select id from expenses where user_id = $1 order by created_at desc limit 1",
    [userId],
  );
  return String(row?.id);
}

function send(expenseId: string, bytes: Uint8Array, name: string, type = "") {
  const body = new FormData();
  body.append("expenseId", expenseId);
  body.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return upload(
    new Request("https://budget.test/api/receipts/upload", {
      method: "POST",
      body,
    }),
  );
}

function claudeReplies(input: Record<string, unknown>) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({
      content: [{ type: "tool_use", name: "record_receipt", input }],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  signInAs("user_a");
});

describe("POST /api/receipts/upload", () => {
  it("keeps a PDF, reads it as a document and returns the total and currency", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetch = claudeReplies({
      merchant: "Ducati Bayonne",
      total: 145.17,
      currency: "eur",
      purchased_on: "2026-08-18",
    });
    const id = await expenseOf("user_a");

    const response = await send(id, PDF, "invoice.pdf", "application/pdf");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "pdf",
      reading: {
        recognised: true,
        fields: { totalCents: 14_517, currency: "EUR" },
      },
      expense: { id, amountCents: 100, parts: 1 },
    });

    const sent = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(sent.messages[0].content[0]).toMatchObject({
      type: "document",
      source: { media_type: "application/pdf" },
    });
    expect(putReceiptFile).toHaveBeenCalledWith(
      expect.stringMatching(/^receipts\/user_a\/[0-9a-f-]{36}\.pdf$/),
      expect.any(Blob),
      "application/pdf",
    );
    const [saved] = await rows(
      `select r.file_kind, r.file_name, r.total_cents, r.currency
       from expenses e join receipts r on r.id = e.receipt_id where e.id = $1`,
      [id],
    );
    expect(saved).toMatchObject({
      file_kind: "pdf",
      file_name: "invoice.pdf",
      total_cents: 14_517,
      currency: "EUR",
    });
  });

  it("keeps any other file as a download only, without reading it", async () => {
    const fetch = claudeReplies({ total: 1 });
    const id = await expenseOf("user_a");

    const response = await send(id, DOCX, "2002_320.docx");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "file",
      reading: { recognised: false, unreadable: true },
    });
    expect(fetch).not.toHaveBeenCalled();

    const [saved] = await rows(
      `select r.id, r.file_pathname from expenses e
       join receipts r on r.id = e.receipt_id where e.id = $1`,
      [id],
    );
    expect(String(saved?.file_pathname)).toMatch(/\.bin$/);

    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream: new Blob([DOCX]).stream(),
      blob: { contentType: "application/octet-stream", size: DOCX.length },
    } as unknown as Awaited<ReturnType<typeof get>>);
    const receiptId = String(saved?.id);
    const served = await getFile(
      new Request(`https://budget.test/api/receipts/${receiptId}/file`),
      { params: Promise.resolve({ id: receiptId }) },
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(served.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="2002_320\.docx"/,
    );
  });

  it("keeps a JPEG as the receipt photo", async () => {
    const id = await expenseOf("user_a");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const response = await send(id, jpeg, "receipt.jpg", "image/jpeg");
    expect(response.status).toBe(200);
    expect((await response.json()).kind).toBe("photo");
    expect(putReceiptImage).toHaveBeenCalled();
  });

  it("refuses someone else's expense without storing anything", async () => {
    const id = await expenseOf("user_b");
    vi.mocked(putReceiptFile).mockClear();
    const response = await send(id, PDF, "invoice.pdf");
    expect(response.status).toBe(404);
    expect(putReceiptFile).not.toHaveBeenCalled();
  });

  it("refuses a signed-out upload and a file over 3MB", async () => {
    const id = await expenseOf("user_a");
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    expect((await send(id, big, "big.pdf")).status).toBe(413);
    signOut();
    expect((await send(id, PDF, "invoice.pdf")).status).toBe(401);
  });
});
