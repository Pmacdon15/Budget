"use client";

import { useMutation } from "@tanstack/react-query";
import {
  approvePendingIncome,
  rejectPendingIncome,
} from "@/actions/pending-income";
import { type ActionError, unwrap } from "@/mutations/action-error";

export function useApprovePendingIncome() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-income", "approve"],
    mutationFn: async (id) => unwrap(await approvePendingIncome(id)),
  });
}

export function useRejectPendingIncome() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["pending-income", "reject"],
    mutationFn: async (id) => unwrap(await rejectPendingIncome(id)),
  });
}
