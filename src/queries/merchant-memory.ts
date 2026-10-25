"use client";

import { useQuery } from "@tanstack/react-query";
import {
  type MerchantMemory,
  merchantMemoryResponseSchema,
} from "@/lib/merchant-memory";

export const MERCHANT_MEMORY_URL = "/api/merchant-categories";

/**
 * Loads the merchant memory. A suggestion is a nice-to-have, so any failure
 * (signed out, offline, an odd answer) is an empty memory, never an error the
 * form has to show.
 */
export async function fetchMerchantMemory(): Promise<MerchantMemory> {
  try {
    const response = await fetch(MERCHANT_MEMORY_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return {};
    const parsed = merchantMemoryResponseSchema.safeParse(
      await response.json(),
    );
    return parsed.success ? parsed.data.merchants : {};
  } catch {
    return {};
  }
}

/**
 * The signed-in user's merchant memory. Refetched each time the expense form
 * opens (it mounts with the dialog), so a category picked a moment ago is
 * suggested on the next expense, while the last answer shows meanwhile.
 */
export function useMerchantMemory(enabled = true) {
  return useQuery({
    queryKey: ["merchant-memory"],
    queryFn: fetchMerchantMemory,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
