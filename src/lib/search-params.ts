import { resolveMonth } from "@/lib/month";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function monthFrom(searchParams: SearchParams) {
  const params = await searchParams;
  const value = params.month;
  return resolveMonth(Array.isArray(value) ? value[0] : value);
}
