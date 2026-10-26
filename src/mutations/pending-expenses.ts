"use client";

import { useMutation } from "@tanstack/react-query";
import {
  approvePendingExpense,
  editPendingExpense,
  rejectPendingExpense,
  setPendingSubscription,
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

/** Approves an item and replaces its fixed bill's amount with this charge. */
export function useReplaceBillAndApprove() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-expenses", "replace"],
    mutationFn: async (id) =>
      unwrap(await approvePendingExpense(id, { replace: true })),
  });
}

/** Marks an item a subscription (fixed bill) or a normal expense. */
export function useSetPendingSubscription() {
  return useMutation<void, ActionError, { id: string; subscription: boolean }>({
    mutationKey: ["pending-expenses", "subscription"],
    mutationFn: async ({ id, subscription }) =>
      unwrap(await setPendingSubscription(id, subscription)),
  });
}
