"use client";

import { useMutation } from "@tanstack/react-query";
import {
  approvePendingAccount,
  createAccount,
  createTransfer,
  deleteAccount,
  deleteTransfer,
  rejectPendingAccount,
  updateAccount,
} from "@/actions/accounts";
import type { AccountFormValues, TransferFormValues } from "@/lib/accounts";
import { type ActionError, unwrap } from "@/mutations/action-error";

/** Creates an account, or updates `id` when given. */
export function useSaveAccount(id?: string) {
  return useMutation<void, ActionError, AccountFormValues>({
    mutationKey: ["accounts", id ? "update" : "create", id],
    mutationFn: async (values) =>
      unwrap(await (id ? updateAccount(id, values) : createAccount(values))),
  });
}

export function useDeleteAccount() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["accounts", "delete"],
    mutationFn: async (id) => unwrap(await deleteAccount(id)),
  });
}

export function useCreateTransfer() {
  return useMutation<void, ActionError, TransferFormValues>({
    mutationKey: ["transfers", "create"],
    mutationFn: async (values) => unwrap(await createTransfer(values)),
  });
}

export function useDeleteTransfer() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["transfers", "delete"],
    mutationFn: async (id) => unwrap(await deleteTransfer(id)),
  });
}

export function useApprovePendingAccount() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-accounts", "approve"],
    mutationFn: async (id) => unwrap(await approvePendingAccount(id)),
  });
}

export function useRejectPendingAccount() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-accounts", "reject"],
    mutationFn: async (id) => unwrap(await rejectPendingAccount(id)),
  });
}
