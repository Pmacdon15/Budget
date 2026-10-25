"use client";

import { useMutation } from "@tanstack/react-query";
import {
  createRecurringIncome,
  recordRecurringIncome,
  skipRecurringIncome,
  stopRecurringIncome,
  unskipRecurringIncome,
  updateRecurringIncome,
} from "@/actions/recurring-income";
import type {
  RecordRecurringIncomeFormValues,
  RecurringIncomeFormValues,
} from "@/lib/recurring-income";
import { type ActionError, unwrap } from "@/mutations/action-error";

type MonthOf = { recurringId: string; month: string };

/** Sets up a repeating paycheque, or edits `id` when given. */
export function useSaveRecurringIncome(id?: string) {
  return useMutation<void, ActionError, RecurringIncomeFormValues>({
    mutationKey: ["recurring-income", id ? "update" : "create", id],
    mutationFn: async (values) =>
      unwrap(
        await (id
          ? updateRecurringIncome(id, values)
          : createRecurringIncome(values)),
      ),
  });
}

export function useStopRecurringIncome() {
  return useMutation<void, ActionError, { id: string; fromMonth: string }>({
    mutationKey: ["recurring-income", "stop"],
    mutationFn: async ({ id, fromMonth }) =>
      unwrap(await stopRecurringIncome(id, fromMonth)),
  });
}

export function useRecordRecurringIncome() {
  return useMutation<void, ActionError, RecordRecurringIncomeFormValues>({
    mutationKey: ["recurring-income", "record"],
    mutationFn: async (values) => unwrap(await recordRecurringIncome(values)),
  });
}

export function useSkipRecurringIncome() {
  return useMutation<void, ActionError, MonthOf>({
    mutationKey: ["recurring-income", "skip"],
    mutationFn: async (values) => unwrap(await skipRecurringIncome(values)),
  });
}

export function useUnskipRecurringIncome() {
  return useMutation<void, ActionError, MonthOf>({
    mutationKey: ["recurring-income", "unskip"],
    mutationFn: async (values) => unwrap(await unskipRecurringIncome(values)),
  });
}
