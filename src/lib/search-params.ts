import { isMonth } from "@/lib/month";
import { requestMonth } from "@/lib/now";

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export async function monthFrom(searchParams: SearchParams) {
  const params = await searchParams;
  const value = Array.isArray(params.month) ? params.month[0] : params.month;
  // No `?month=`: this month, read once the request is real.
  return isMonth(value) ? value : requestMonth();
}
