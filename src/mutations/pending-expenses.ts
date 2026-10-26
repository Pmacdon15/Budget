"use client";

import { useMutation } from "@tanstack/react-query";
import {
  approvePendingExpense,
  editPendingExpense,
  rejectPendingExpense,
} from "@/actions/pending-expenses";
import type { ExpenseFormValues } from "@/lib/schemas";
import { type ActionError, unwrap } from "@/mutations/action-error";

export function useEditPendingExpense(id: string) {
  return useMutation<void, ActionError, ExpenseFormValues>({
    mutationKey: ["pending-expenses", "edit", id],
    mutationFn: async (values) => unwrap(await editPendingExpense(id, values)),
  });
}

export function useApprovePendingExpense() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-expenses", "approve"],
    mutationFn: async (id) => unwrap(await approvePendingExpense(id)),
  });
}

export function useRejectPendingExpense() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-expenses", "reject"],
    mutationFn: async (id) => unwrap(await rejectPendingExpense(id)),
  });
}
