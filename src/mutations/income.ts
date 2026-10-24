"use client";

import { useMutation } from "@tanstack/react-query";
import { createIncome, deleteIncome, updateIncome } from "@/actions/income";
import type { IncomeFormValues } from "@/lib/schemas";
import { type ActionError, unwrap } from "@/mutations/action-error";

/** Creates a take-home entry, or updates `id` when given. */
export function useSaveIncome(id?: string) {
  return useMutation<void, ActionError, IncomeFormValues>({
    mutationKey: ["income", id ? "update" : "create", id],
    mutationFn: async (values) =>
      unwrap(await (id ? updateIncome(id, values) : createIncome(values))),
  });
}

export function useDeleteIncome() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["income", "delete"],
    mutationFn: async (id) => unwrap(await deleteIncome(id)),
  });
}
