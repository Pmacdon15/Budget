import { get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getImage } from "@/app/api/receipts/[id]/image/route";
import { POST as scan } from "@/app/api/receipts/route";
import { insertExpenseWithReceipt, selectExpensesBetween } from "@/db/expenses";
import { putReceiptImage } from "@/lib/receipt-store";
import { signInAs, signOut } from "./../helpers/auth";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ get: vi.fn() }));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(async () => {
    throw new Error("not on Vercel");
  }),
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function upload(bytes: Uint8Array | null, type = "image/jpeg") {
  const body = new FormData();
  if (bytes)
    body.append("file", new Blob([new Uint8Array(bytes)], { type }), "r.jpg");
  return scan(
    new Request("https://budget.test/api/receipts", { method: "POST", body }),
  );
}

function claudeReplies(input: Record<string, unknown>) {
  const fetch = vi.fn(async () =>
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
});

describe("POST /api/receipts", () => {
  it("stores the photo in the user's folder and returns what the AI read", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetch = claudeReplies({
      merchant: "Costco",
      total: 113,
      tax: 13,
      purchased_on: "2026-10-05",
      category: "Groceries",
    });

    const response = await upload(JPEG);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.image).toMatch(/^receipts\/user_a\/[0-9a-f-]{36}\.jpg$/);
    expect(body).toMatchObject({
      recognised: true,
      fields: {
        merchant: "Costco",
        totalCents: 11_300,
        taxCents: 1_300,
        purchasedOn: "2026-10-05",
        category: "Groceries",
      },
    });
    expect(putReceiptImage).toHaveBeenCalledWith(body.image, expect.any(Blob));
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.anything(),
    );
  });

  it("still saves the photo when no AI is available", async () => {
    const response = await upload(JPEG);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recognised: false,
      fields: {},
      unavailable: true,
    });
  });

  it("still saves the photo when the AI call fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("overloaded", { status: 529 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await upload(JPEG);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recognised: false,
      unavailable: true,
    });
  });

  it("rejects anything that isn't a JPEG", async () => {
    expect((await upload(new Uint8Array([1, 2, 3, 4]))).status).toBe(415);
    expect((await upload(JPEG, "image/png")).status).toBe(415);
    expect((await upload(null)).status).toBe(400);
    expect(putReceiptImage).not.toHaveBeenCalled();
  });

  it("rejects a photo over the size limit", async () => {
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    big.set(JPEG);
    expect((await upload(big)).status).toBe(413);
  });

  it("reports a storage failure", async () => {
    vi.mocked(putReceiptImage).mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await upload(JPEG);
    expect(response.status).toBe(502);
  });

  it("requires sign-in", async () => {
    signOut();
    expect((await upload(JPEG)).status).toBe(401);
  });
});

describe("GET /api/receipts/[id]/image", () => {
  const photo = "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg";

  async function savedReceiptId() {
    await insertExpenseWithReceipt(
      "user_a",
      {
        month: "2026-10",
        spentOn: "2026-10-05",
        description: "Costco",
        category: "Groceries",
        amountCents: 100,
      },
      {
        imagePathname: photo,
        merchant: null,
        purchasedOn: null,
        subtotalCents: null,
        taxCents: null,
        totalCents: null,
        rawText: null,
      },
    );
    const [expense] = await selectExpensesBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );
    return expense?.receiptId as string;
  }

  const fetchImage = (id: string) =>
    getImage(new Request(`https://budget.test/api/receipts/${id}/image`), {
      params: Promise.resolve({ id }),
    });

  it("streams the owner's photo", async () => {
    const id = await savedReceiptId();
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream: new Blob([JPEG]).stream(),
      blob: { contentType: "image/jpeg", size: JPEG.length },
    } as unknown as Awaited<ReturnType<typeof get>>);

    const response = await fetchImage(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
    expect(get).toHaveBeenCalledWith(photo, { access: "private" });
  });

  it("is a 404 for someone else's receipt, a bad id or a missing photo", async () => {
    const id = await savedReceiptId();
    signInAs("user_b");
    expect((await fetchImage(id)).status).toBe(404);
    expect((await fetchImage("not-a-uuid")).status).toBe(404);
    expect(get).not.toHaveBeenCalled();

    signInAs("user_a");
    vi.mocked(get).mockResolvedValueOnce(null);
    expect((await fetchImage(id)).status).toBe(404);
  });

  it("requires sign-in", async () => {
    const id = await savedReceiptId();
    signOut();
    expect((await fetchImage(id)).status).toBe(401);
  });
});
