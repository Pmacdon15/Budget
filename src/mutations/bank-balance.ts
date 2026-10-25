"use client";

import { useMutation } from "@tanstack/react-query";
import { clearBankBalance, setBankBalance } from "@/actions/bank-balance";
import type { BankBalanceFormValues } from "@/lib/bank-balance";
import { type ActionError, unwrap } from "@/mutations/action-error";

export function useSetBankBalance() {
  return useMutation<void, ActionError, BankBalanceFormValues>({
    mutationKey: ["bank-balance", "set"],
    mutationFn: async (values) => unwrap(await setBankBalance(values)),
  });
}

export function useClearBankBalance() {
  return useMutation<void, ActionError, void>({
    mutationKey: ["bank-balance", "clear"],
    mutationFn: async () => unwrap(await clearBankBalance()),
  });
}
