import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import {
  deleteBankBalance,
  selectBankBalance,
  upsertBankBalance,
} from "@/db/bank-balance";
import type { BankBalance, BankBalanceInput } from "@/lib/bank-balance";

/* ---------- Reads ---------- */

/** The signed-in user's balance, or null before they've entered one. */
export const getBankBalance = cache(async (): Promise<BankBalance | null> => {
  const userId = await requireUserId();
  return selectBankBalance(userId);
});

/* ---------- Writes ---------- */

export async function setBankBalance(input: BankBalanceInput) {
  const userId = await currentUserIdOrThrow();
  await upsertBankBalance(userId, input.balance);
}

/** Removes the balance. Clearing one that isn't there is fine. */
export async function clearBankBalance() {
  const userId = await currentUserIdOrThrow();
  await deleteBankBalance(userId);
}
