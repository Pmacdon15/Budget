"use client";

import { useMutation } from "@tanstack/react-query";
import {
  contributeToGoal,
  createSavingsGoal,
  deleteSavingsGoal,
  updateSavingsGoal,
} from "@/actions/savings-goals";
import type {
  ContributionFormValues,
  SavingsGoalFormValues,
} from "@/lib/savings-goals";
import { type ActionError, unwrap } from "@/mutations/action-error";

/** Creates a goal, or updates `id` when given. */
export function useSaveSavingsGoal(id?: string) {
  return useMutation<void, ActionError, SavingsGoalFormValues>({
    mutationKey: ["savings-goals", id ? "update" : "create", id],
    mutationFn: async (values) =>
      unwrap(
        await (id ? updateSavingsGoal(id, values) : createSavingsGoal(values)),
      ),
  });
}

export function useDeleteSavingsGoal() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["savings-goals", "delete"],
    mutationFn: async (id) => unwrap(await deleteSavingsGoal(id)),
  });
}

export function useContributeToGoal() {
  return useMutation<void, ActionError, ContributionFormValues>({
    mutationKey: ["savings-goals", "contribute"],
    mutationFn: async (values) => unwrap(await contributeToGoal(values)),
  });
}
