import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { CATEGORIES, CATEGORY_NAMES, isCategory } from "@/lib/categories";
import { parseMoney } from "@/lib/money";
import type { ReceiptSplit, ScannedFields, ScanResult } from "@/lib/types";

/**
 * Reads a receipt photo with Claude's vision model.
 *
 * The model is given one tool it must call, whose input schema is the shape we
 * want back, so the answer arrives structured rather than as prose. Every
 * field it returns is only a suggestion: each is checked on its own (one bad
 * value drops that field, not the reading) and the scan form uses them to
 * pre-fill inputs the user still confirms.
 *
 * Which endpoint is used:
 * - `ANTHROPIC_API_KEY` set: the Claude API directly.
 * - Otherwise Vercel AI Gateway, authenticated with `AI_GATEWAY_API_KEY` or,
 *   on a Vercel deployment, the project's own OIDC token. That last case needs
 *   no key at all, which is how the deployed app runs.
 * - Neither available (local dev without keys): reading is off and the form
 *   simply opens empty.
 *
 * Plain fetch rather than an SDK: it is one request.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/messages";
const API_VERSION = "2023-06-01";
// Opus reads faded, crumpled and handwritten receipts best. RECEIPT_VISION_MODEL
// can point at a smaller, quicker model (e.g. claude-haiku-5-5) instead.
export const ANTHROPIC_MODEL = "claude-opus-5-5";
export const GATEWAY_MODEL = "anthropic/claude-opus-5.5";
const TOOL_NAME = "record_receipt";
const RAW_TEXT_MAX = 4000;
const MERCHANT_MAX = 120;

export type { ScannedFields, ScanResult };

export const NOT_RECOGNISED: ScanResult = { recognised: false, fields: {} };

/** The reader couldn't be reached (no credentials, or the API refused). */
export const UNAVAILABLE: ScanResult = {
  recognised: false,
  fields: {},
  unavailable: true,
};

const CATEGORY_GUIDE = CATEGORIES.map((c) => `- ${c.name}: ${c.hint}`).join(
  "\n",
);

const PROMPT = `Read this receipt photo and record it with the ${TOOL_NAME} tool.

Rules:
- Amounts are plain numbers in the receipt's currency (42.17), never strings.
- purchased_on is the purchase date as YYYY-MM-DD. Leave it out if you cannot read it.
- Leave out any field you cannot read rather than guessing.
- merchant is the store or business name as a person would say it ("Costco", not "COSTCO WHOLESALE #552").
- raw_text is a plain transcription of the receipt, top to bottom.
- category is the one budget category the purchase mostly belongs to.

Categories:
${CATEGORY_GUIDE}

Splits: if the line items clearly belong to two or more different categories
(groceries and beer on one supermarket receipt, or snacks and car wash fluid at
a gas station, say), add a "splits" list with one entry per category and how
much of the total went to it. Share tax and fees across the categories in
proportion to their items, so the split amounts add up exactly to the total.
If everything belongs to one category, leave "splits" out.`;

const TOOL = {
  name: TOOL_NAME,
  description: "Record the fields read off a receipt photo.",
  input_schema: {
    type: "object",
    properties: {
      merchant: { type: "string", description: "Store or business name." },
      purchased_on: { type: "string", description: "YYYY-MM-DD" },
      subtotal: { type: "number" },
      tax: { type: "number", description: "All taxes combined." },
      total: { type: "number", description: "Amount paid." },
      category: { type: "string", enum: CATEGORY_NAMES },
      raw_text: { type: "string" },
      splits: {
        type: "array",
        description: "Only when the items span two or more categories.",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: CATEGORY_NAMES },
            amount: { type: "number" },
          },
          required: ["category", "amount"],
        },
      },
    },
  },
} as const;

type Endpoint = { url: string; model: string; headers: HeadersInit };

export type ReadDeps = {
  env?: Record<string, string | undefined>;
  oidcToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
};

async function defaultOidcToken() {
  try {
    return await getVercelOidcToken();
  } catch {
    // Not on Vercel (or OIDC is off for the project).
    return null;
  }
}

/** Which API to call, or null when no credentials are available. */
export async function resolveEndpoint(
  deps: ReadDeps = {},
): Promise<Endpoint | null> {
  const env = deps.env ?? process.env;
  const model = env.RECEIPT_VISION_MODEL?.trim();

  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      url: ANTHROPIC_URL,
      model: model || ANTHROPIC_MODEL,
      headers: { "x-api-key": anthropicKey },
    };
  }

  const gatewayToken =
    env.AI_GATEWAY_API_KEY?.trim() ||
    (await (deps.oidcToken ?? defaultOidcToken)());
  if (gatewayToken) {
    return {
      url: GATEWAY_URL,
      model: model || GATEWAY_MODEL,
      headers: { authorization: `Bearer ${gatewayToken}` },
    };
  }

  return null;
}

/** Reads what it can off a JPEG. Throws on an API failure; see `readReceiptSafely`. */
export async function readReceipt(
  image: Uint8Array,
  deps: ReadDeps = {},
): Promise<ScanResult> {
  if (image.byteLength === 0) return NOT_RECOGNISED;
  const endpoint = await resolveEndpoint(deps);
  if (!endpoint) return UNAVAILABLE;

  const response = await (deps.fetch ?? fetch)(endpoint.url, {
    method: "POST",
    headers: {
      ...endpoint.headers,
      "content-type": "application/json",
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: endpoint.model,
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: Buffer.from(image).toString("base64"),
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Receipt reader returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }

  const body = (await response.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
  };
  const toolUse = body.content?.find(
    (block) => block.type === "tool_use" && block.name === TOOL_NAME,
  );
  if (!toolUse || typeof toolUse.input !== "object" || !toolUse.input) {
    return NOT_RECOGNISED;
  }
  return toScanResult(toolUse.input as Record<string, unknown>);
}

/**
 * Never throws: a failed call comes back as `unavailable`, so the form can say
 * reading is down rather than blaming the photo.
 */
export async function readReceiptSafely(
  image: Uint8Array,
  deps?: ReadDeps,
): Promise<ScanResult> {
  try {
    return await readReceipt(image, deps);
  } catch (error) {
    console.error("reading the receipt failed", error);
    return UNAVAILABLE;
  }
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function toCents(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = typeof value === "number" ? value.toFixed(2) : value;
  const cents = parseMoney(text);
  return cents === null ? undefined : cents;
}

function toText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** The model's tool input, checked field by field. Exported for tests. */
export function toScanResult(input: Record<string, unknown>): ScanResult {
  const fields: ScannedFields = {};

  const merchant = toText(input.merchant, MERCHANT_MAX);
  if (merchant) fields.merchant = merchant;

  if (typeof input.purchased_on === "string") {
    const date = input.purchased_on.trim();
    if (ISO_DATE.test(date)) fields.purchasedOn = date;
  }

  const total = toCents(input.total);
  const subtotal = toCents(input.subtotal);
  const tax = toCents(input.tax);
  if (total !== undefined) fields.totalCents = total;
  if (subtotal !== undefined) fields.subtotalCents = subtotal;
  if (tax !== undefined) fields.taxCents = tax;

  if (isCategory(input.category)) fields.category = input.category;

  const rawText = toText(input.raw_text, RAW_TEXT_MAX);
  if (rawText) fields.rawText = rawText;

  if (total !== undefined) {
    const splits = toSplits(input.splits, total);
    if (splits) {
      fields.splits = splits;
      // The headline category is the biggest part of the split.
      fields.category = splits[0]?.category;
    }
  }

  return { recognised: Object.keys(fields).length > 0, fields };
}

/**
 * The model's split, cleaned up: unknown categories dropped, repeats merged,
 * and the parts made to add up to the total. A rounding gap of a few cents
 * goes onto the largest part; anything bigger means the model got it wrong,
 * so no split is suggested. Largest part first. Exported for tests.
 */
export function toSplits(
  value: unknown,
  totalCents: number,
): ReceiptSplit[] | null {
  if (!Array.isArray(value)) return null;

  const byCategory = new Map<ReceiptSplit["category"], number>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { category, amount } = entry as {
      category?: unknown;
      amount?: unknown;
    };
    const cents = toCents(amount);
    if (!isCategory(category) || !cents) continue;
    byCategory.set(category, (byCategory.get(category) ?? 0) + cents);
  }

  const splits = [...byCategory]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
  if (splits.length < 2) return null;

  const gap = totalCents - splits.reduce((sum, s) => sum + s.amountCents, 0);
  if (Math.abs(gap) > splits.length * 2) return null;
  const largest = splits[0] as ReceiptSplit;
  largest.amountCents += gap;
  return largest.amountCents > 0 ? splits : null;
}
