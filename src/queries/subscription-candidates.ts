"use client";

import { useQuery } from "@tanstack/react-query";
import type { SubscriptionCandidate } from "@/lib/subscription-candidates";

export const SUBSCRIPTION_CANDIDATES_URL = "/api/subscription-candidates";

export const SUBSCRIPTION_CANDIDATES_KEY = ["subscription-candidates"];

/** Loads the expenses that look like subscriptions, up to `month`. */
export async function fetchSubscriptionCandidates(
  month: string,
): Promise<SubscriptionCandidate[]> {
  const response = await fetch(
    `${SUBSCRIPTION_CANDIDATES_URL}?month=${encodeURIComponent(month)}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.candidates)) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Couldn't look for subscriptions. Please try again.",
    );
  }
  return body.candidates;
}

/** The candidates, fetched when the dialog opens (`enabled`), fresh each time. */
export function useSubscriptionCandidates(month: string, enabled: boolean) {
  return useQuery({
    queryKey: [...SUBSCRIPTION_CANDIDATES_KEY, month],
    queryFn: () => fetchSubscriptionCandidates(month),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
