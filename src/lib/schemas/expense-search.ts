import { z } from "zod";
import { CATEGORY_NAMES } from "@/lib/categories";
import { parseMoney } from "@/lib/money";
import type { SearchParams } from "@/lib/search-params";

/**
 * Search and filters for the Spending page. They live in the URL
 * (`?q=&category=&min=&max=&scope=`) so a search can be bookmarked, shared and
 * kept while switching months.
 *
 * The URL is user input, so a bad value is dropped rather than shown as an
 * error: `?min=abc` simply means "no minimum".
 */

export const EXPENSE_SEARCH_KEYS = [
  "q",
  "category",
  "min",
  "max",
  "scope",
] as const;

/** Longest search text kept; anything after it is cut off. */
export const SEARCH_TEXT_MAX = 100;

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const text = z.preprocess(
  first,
  z
    .string()
    .trim()
    .transform((v) => v.slice(0, SEARCH_TEXT_MAX))
    .catch(""),
);

const category = z.preprocess(
  first,
  z.enum(CATEGORY_NAMES).nullable().catch(null),
);

const cents = z.preprocess(
  first,
  z
    .string()
    .transform((v) => (v.trim() === "" ? null : parseMoney(v)))
    .nullable()
    .catch(null),
);

const scope = z.preprocess(first, z.enum(["month", "all"]).catch("month"));

export const expenseSearchSchema = z
  .object({ q: text, category, min: cents, max: cents, scope })
  .transform(({ q, category, min, max, scope }) => {
    // A range typed back to front still means what the person meant.
    const [minCents, maxCents] =
      min !== null && max !== null && min > max ? [max, min] : [min, max];
    return { q, category, minCents, maxCents, allMonths: scope === "all" };
  });

export type ExpenseSearch = z.output<typeof expenseSearchSchema>;

export const EMPTY_SEARCH: ExpenseSearch = {
  q: "",
  category: null,
  minCents: null,
  maxCents: null,
  allMonths: false,
};

export function parseExpenseSearch(
  params: Record<string, string | string[] | undefined>,
): ExpenseSearch {
  return expenseSearchSchema.parse(params);
}

/** Reads the search from the page's `searchParams`. Await it inside `<Suspense>`. */
export async function expenseSearchFrom(searchParams: SearchParams) {
  return parseExpenseSearch(await searchParams);
}

/** True when any search text or filter is set, so the list should be narrowed. */
export function isSearching(search: ExpenseSearch) {
  return (
    search.q !== "" ||
    search.category !== null ||
    search.minCents !== null ||
    search.maxCents !== null ||
    search.allMonths
  );
}

/** What the search form posts, as typed. */
export type ExpenseSearchValues = {
  q?: string;
  category?: string;
  min?: string;
  max?: string;
  scope?: string;
};

/**
 * The query string for a search, keeping every other parameter (the month)
 * from `current`. Empty and default values are left out so the URL stays short.
 */
export function expenseSearchQuery(
  current: URLSearchParams | string,
  values: ExpenseSearchValues,
) {
  const next = new URLSearchParams(current);
  for (const key of EXPENSE_SEARCH_KEYS) next.delete(key);

  const q = values.q?.trim().slice(0, SEARCH_TEXT_MAX);
  if (q) next.set("q", q);
  if (values.category && values.category !== "all") {
    next.set("category", values.category);
  }
  const min = values.min?.trim();
  if (min) next.set("min", min);
  const max = values.max?.trim();
  if (max) next.set("max", max);
  if (values.scope === "all") next.set("scope", "all");

  return next.toString();
}
