import { z } from "zod";
import { CATEGORY_NAMES, type Category, isCategory } from "@/lib/categories";

/**
 * Merchant memory: the category the user picked last time for a merchant, so
 * the expense form can suggest it next time.
 *
 * Nothing extra is stored. The memory is read back from the user's own saved
 * expenses (their description, and the merchant read off a scanned receipt),
 * so editing an expense's category updates what is suggested, and deleting it
 * forgets it.
 */

/** How many recent expenses are looked at; older choices age out. */
export const MERCHANT_MEMORY_LIMIT = 1000;

/** Keys shorter than this are too vague to match on ("a", "x"). */
const MIN_KEY_LENGTH = 2;

/**
 * Normalises a merchant name so small differences still match:
 * "COSTCO WHOLESALE #1234", "Costco Wholesale" and "costco  wholesale 1234"
 * share the key "costco wholesale". Returns null when nothing usable is left.
 */
export function merchantKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Store numbers: "#1234", "# 12".
    .replace(/#\s*\d+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  // A trailing number is usually a store or terminal id ("Esso 4471").
  while (words.length > 1 && /^\d+$/.test(words[words.length - 1] ?? "")) {
    words.pop();
  }
  const key = words.join(" ");
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

/** One saved expense line, newest first, as the memory reads it. */
export type MerchantChoice = {
  description: string;
  merchant: string | null;
  category: string;
};

/** Merchant key → the category picked most recently for it. */
export type MerchantMemory = Record<string, Category>;

/**
 * Builds the memory from expenses ordered newest first (and, within one split
 * receipt, largest part first), so the first category seen for a key is the
 * one picked last time.
 */
export function buildMerchantMemory(
  choices: Iterable<MerchantChoice>,
): MerchantMemory {
  const memory: MerchantMemory = {};
  for (const choice of choices) {
    if (!isCategory(choice.category)) continue;
    for (const name of [choice.merchant, choice.description]) {
      const key = merchantKey(name);
      if (key && !Object.hasOwn(memory, key)) memory[key] = choice.category;
    }
  }
  return memory;
}

/** A remembered category and the name it was found under. */
export type MerchantSuggestion = { category: Category; merchant: string };

/** The remembered category for the first of `names` that has one. */
export function rememberedCategory(
  memory: MerchantMemory | undefined,
  ...names: (string | null | undefined)[]
): MerchantSuggestion | undefined {
  if (!memory) return undefined;
  for (const name of names) {
    const key = merchantKey(name);
    if (name && key && Object.hasOwn(memory, key)) {
      const category = memory[key];
      if (category) return { category, merchant: name.trim() };
    }
  }
  return undefined;
}

/** What `GET /api/merchant-categories` answers. */
export const merchantMemoryResponseSchema = z.object({
  merchants: z.record(z.string(), z.enum(CATEGORY_NAMES)),
});
