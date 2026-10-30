import { z } from "zod";
import { isMonth } from "@/lib/month";
import { requestMonth } from "@/lib/now";
import type { SearchParams } from "@/lib/search-params";

/** A calendar year the year view can show, e.g. `?year=2026`. */
export const yearSchema = z.coerce
  .number({ error: "Invalid year" })
  .int("Invalid year")
  .min(2000, "Invalid year")
  .max(2100, "Invalid year");

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * The year to show: `?year=`, else the year of `?month=` (the nav keeps the
 * selected month in the URL), else null for the current year.
 */
export function resolveYear(
  params: Record<string, string | string[] | undefined>,
) {
  const year = yearSchema.safeParse(first(params.year));
  if (year.success) return year.data;
  const month = first(params.month);
  if (isMonth(month)) return Number(month.slice(0, 4));
  return null;
}

/** Call without `await` in a page and pass the promise down. */
export async function yearFrom(searchParams: SearchParams) {
  return (
    resolveYear(await searchParams) ??
    Number((await requestMonth()).slice(0, 4))
  );
}
