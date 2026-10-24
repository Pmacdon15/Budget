import { describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MODEL,
  GATEWAY_MODEL,
  readReceipt,
  readReceiptSafely,
  resolveEndpoint,
  toScanResult,
  toSplits,
} from "@/lib/receipt-ai";

vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: vi.fn() }));

const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const noOidc = async () => null;

describe("resolveEndpoint", () => {
  it("prefers a direct Claude API key", async () => {
    expect(
      await resolveEndpoint({
        env: { ANTHROPIC_API_KEY: "sk-ant", AI_GATEWAY_API_KEY: "gw" },
        oidcToken: async () => "oidc",
      }),
    ).toEqual({
      url: "https://api.anthropic.com/v1/messages",
      model: ANTHROPIC_MODEL,
      headers: { "x-api-key": "sk-ant" },
    });
  });

  it("uses AI Gateway with its key, then with the Vercel OIDC token", async () => {
    expect(
      await resolveEndpoint({
        env: { AI_GATEWAY_API_KEY: "gw" },
        oidcToken: async () => "oidc",
      }),
    ).toEqual({
      url: "https://ai-gateway.vercel.sh/v1/messages",
      model: GATEWAY_MODEL,
      headers: { authorization: "Bearer gw" },
    });
    expect(
      await resolveEndpoint({ env: {}, oidcToken: async () => "oidc" }),
    ).toMatchObject({ headers: { authorization: "Bearer oidc" } });
  });

  it("honours RECEIPT_VISION_MODEL and is off with no credentials", async () => {
    expect(
      await resolveEndpoint({
        env: {
          ANTHROPIC_API_KEY: "k",
          RECEIPT_VISION_MODEL: "claude-sonnet-5-5",
        },
      }),
    ).toMatchObject({ model: "claude-sonnet-5-5" });
    expect(
      await resolveEndpoint({
        env: { ANTHROPIC_API_KEY: "  " },
        oidcToken: noOidc,
      }),
    ).toBeNull();
  });

  it("treats a failing OIDC lookup as no credentials", async () => {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    vi.mocked(getVercelOidcToken).mockRejectedValueOnce(new Error("no"));
    expect(await resolveEndpoint({ env: {} })).toBeNull();
  });
});

describe("readReceipt", () => {
  it("sends the photo with a forced tool call and returns the checked fields", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        content: [
          { type: "text", text: "Here you go" },
          {
            type: "tool_use",
            name: "record_receipt",
            input: {
              merchant: "Esso",
              total: 60.5,
              category: "Transportation",
            },
          },
        ],
      }),
    );
    const result = await readReceipt(IMAGE, {
      env: { AI_GATEWAY_API_KEY: "gw" },
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    expect(result).toEqual({
      recognised: true,
      fields: {
        merchant: "Esso",
        totalCents: 6_050,
        category: "Transportation",
      },
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/messages");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(GATEWAY_MODEL);
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_receipt" });
    expect(body.tools[0].input_schema.properties.category.enum).toContain(
      "Groceries",
    );
    expect(body.messages[0].content[0].source).toEqual({
      type: "base64",
      media_type: "image/jpeg",
      data: Buffer.from(IMAGE).toString("base64"),
    });
  });

  it("returns nothing when reading is off, the image is empty or there's no tool call", async () => {
    const fetch = vi.fn(async () => Response.json({ content: [] }));
    const deps = {
      env: { ANTHROPIC_API_KEY: "k" },
      fetch: fetch as unknown as typeof globalThis.fetch,
    };
    expect(await readReceipt(new Uint8Array(), deps)).toEqual({
      recognised: false,
      fields: {},
    });
    expect(fetch).not.toHaveBeenCalled();
    expect((await readReceipt(IMAGE, deps)).recognised).toBe(false);
    expect(
      (await readReceipt(IMAGE, { env: {}, oidcToken: noOidc })).recognised,
    ).toBe(false);
  });

  it("throws on an API error, which the safe variant swallows", async () => {
    const deps = {
      env: { ANTHROPIC_API_KEY: "k" },
      fetch: (async () =>
        new Response("bad key", { status: 401 })) as unknown as typeof fetch,
    };
    await expect(readReceipt(IMAGE, deps)).rejects.toThrow(/401: bad key/);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readReceiptSafely(IMAGE, deps)).toEqual({
      recognised: false,
      fields: {},
      unavailable: true,
    });
  });
});

describe("toScanResult", () => {
  it("keeps every valid field", () => {
    expect(
      toScanResult({
        merchant: "  Costco  ",
        purchased_on: "2026-10-05",
        subtotal: 100,
        tax: "13.00",
        total: 113.0000001,
        category: "Groceries",
        raw_text: " COSTCO ",
      }),
    ).toEqual({
      recognised: true,
      fields: {
        merchant: "Costco",
        purchasedOn: "2026-10-05",
        subtotalCents: 10_000,
        taxCents: 1_300,
        totalCents: 11_300,
        category: "Groceries",
        rawText: "COSTCO",
      },
    });
  });

  it("drops bad fields one at a time", () => {
    expect(
      toScanResult({
        merchant: 42,
        purchased_on: "Oct 5",
        total: -3,
        tax: "lots",
        category: "Yachts",
        raw_text: "",
      }),
    ).toEqual({ recognised: false, fields: {} });
    expect(toScanResult({ total: 9.99, purchased_on: "2026-13-01" })).toEqual({
      recognised: true,
      fields: { totalCents: 999 },
    });
  });

  it("caps long text", () => {
    const { fields } = toScanResult({
      merchant: "m".repeat(500),
      raw_text: "r".repeat(10_000),
    });
    expect(fields.merchant).toHaveLength(120);
    expect(fields.rawText).toHaveLength(4000);
  });
});

describe("receipt splits", () => {
  it("asks the model to split mixed receipts using the category hints", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ content: [] }),
    );
    await readReceipt(IMAGE, {
      env: { ANTHROPIC_API_KEY: "k" },
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    const prompt = body.messages[0].content[1].text as string;
    expect(prompt).toContain("- Alcohol: beer, wine");
    expect(prompt).toContain("- Auto: car repairs");
    expect(prompt).toContain('"splits"');
    expect(body.tools[0].input_schema.properties.splits.items.required).toEqual(
      ["category", "amount"],
    );
  });

  it("keeps a split that adds up, largest part first, as the headline category", () => {
    expect(
      toScanResult({
        total: 113,
        category: "Groceries",
        splits: [
          { category: "Alcohol", amount: 33 },
          { category: "Groceries", amount: 80 },
        ],
      }).fields,
    ).toEqual({
      totalCents: 11_300,
      category: "Groceries",
      splits: [
        { category: "Groceries", amountCents: 8_000 },
        { category: "Alcohol", amountCents: 3_300 },
      ],
    });
  });

  it("puts a rounding gap on the largest part and merges repeats", () => {
    expect(
      toSplits(
        [
          { category: "Groceries", amount: 50.01 },
          { category: "Groceries", amount: 20 },
          { category: "Alcohol", amount: 30 },
          { category: "Yachts", amount: 5 },
          { category: "Food", amount: 0 },
          "junk",
        ],
        10_000,
      ),
    ).toEqual([
      { category: "Groceries", amountCents: 7_000 },
      { category: "Alcohol", amountCents: 3_000 },
    ]);
  });

  it("drops a split that doesn't add up or has one part", () => {
    expect(
      toSplits(
        [
          { category: "Groceries", amount: 50 },
          { category: "Alcohol", amount: 20 },
        ],
        10_000,
      ),
    ).toBeNull();
    expect(
      toSplits([{ category: "Groceries", amount: 100 }], 10_000),
    ).toBeNull();
    expect(toSplits("nope", 10_000)).toBeNull();
    // No total means nothing to check a split against.
    expect(
      toScanResult({
        splits: [
          { category: "Groceries", amount: 1 },
          { category: "Alcohol", amount: 1 },
        ],
      }).fields.splits,
    ).toBeUndefined();
  });
});

describe("model", () => {
  it("reads receipts with Claude Opus 5.5 by default", async () => {
    expect(ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    expect(GATEWAY_MODEL).toBe("anthropic/claude-opus-5.5");
    expect(
      await resolveEndpoint({ env: { ANTHROPIC_API_KEY: "k" } }),
    ).toMatchObject({ model: "claude-opus-5-5" });
  });

  it("marks reading unavailable when there are no credentials", async () => {
    expect(await readReceipt(IMAGE, { env: {}, oidcToken: noOidc })).toEqual({
      recognised: false,
      fields: {},
      unavailable: true,
    });
  });
});
