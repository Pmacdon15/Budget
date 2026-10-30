"use client";

import { useQuery } from "@tanstack/react-query";
import {
  type ExpenseAccountOption,
  expenseAccountsResponseSchema,
} from "@/lib/expense-accounts";

export const EXPENSE_ACCOUNTS_URL = "/api/expense-accounts";

/**
 * Loads the accounts an expense can come out of. Any failure (signed out,
 * offline, an odd answer) is an empty list: the form then shows no picker,
 * and the server still refuses to guess when there's more than one account.
 */
export async function fetchExpenseAccounts(): Promise<ExpenseAccountOption[]> {
  try {
    const response = await fetch(EXPENSE_ACCOUNTS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const parsed = expenseAccountsResponseSchema.safeParse(
      await response.json(),
    );
    return parsed.success ? parsed.data.accounts : [];
  } catch {
    return [];
  }
}

/**
 * The signed-in user's accounts. Refetched each time an expense form opens
 * (it mounts with the dialog), so an account added a moment ago is offered.
 */
export function useExpenseAccounts(enabled = true) {
  return useQuery({
    queryKey: ["expense-accounts"],
    queryFn: fetchExpenseAccounts,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
