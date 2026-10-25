import { z } from "zod";
import type { SearchParams } from "@/lib/search-params";

/** The receipt library shows at most this many receipts, newest first. */
export const RECEIPT_LIBRARY_LIMIT = 200;

/** Longest search text kept from the URL. */
export const RECEIPT_SEARCH_MAX_LENGTH = 100;

/**
 * `?q=` on the receipt library: free text matched against the merchant and the
 * expense descriptions. Lenient, since it comes straight from the URL: a
 * repeated param keeps the first value, anything odd becomes "no search", and
 * overly long text is cut rather than rejected.
 */
export const receiptSearchSchema = z
  .preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z
      .string()
      .transform((value) =>
        value.trim().slice(0, RECEIPT_SEARCH_MAX_LENGTH).trim(),
      ),
  )
  .catch("");

export function parseReceiptSearch(value: unknown): string {
  return receiptSearchSchema.parse(value);
}

/** Reads the search text from the page's `searchParams`. */
export async function receiptSearchFrom(searchParams: SearchParams) {
  const params = await searchParams;
  return parseReceiptSearch(params.q);
}

/** A `LIKE` pattern matching `text` anywhere, with `%`, `_` and `\` taken literally. */
export function containsPattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
