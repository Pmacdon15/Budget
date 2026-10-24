"use client";

import { useMutation } from "@tanstack/react-query";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/actions/expenses";
import type { ExpenseFormValues } from "@/lib/schemas";
import { type ActionError, unwrap } from "@/mutations/action-error";

/** Creates an expense, or updates `id` when given. */
export function useSaveExpense(id?: string) {
  return useMutation<void, ActionError, ExpenseFormValues>({
    mutationKey: ["expenses", id ? "update" : "create", id],
    mutationFn: async (values) =>
      unwrap(await (id ? updateExpense(id, values) : createExpense(values))),
  });
}

export function useDeleteExpense() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["expenses", "delete"],
    mutationFn: async (id) => unwrap(await deleteExpense(id)),
  });
}
