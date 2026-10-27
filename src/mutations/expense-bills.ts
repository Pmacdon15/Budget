"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  convertSubscriptions,
  makeExpenseFixedBill,
} from "@/actions/expense-bills";
import type {
  ConvertSubscriptionsResult,
  ConvertSubscriptionsValues,
  MakeFixedBillFormValues,
} from "@/lib/schemas/expense-bills";
import { ActionError, unwrap } from "@/mutations/action-error";
import { SUBSCRIPTION_CANDIDATES_KEY } from "@/queries/subscription-candidates";

/** Makes one expense a fixed bill, or a payment of a bill the user has. */
export function useMakeExpenseFixedBill() {
  const queryClient = useQueryClient();
  return useMutation<void, ActionError, MakeFixedBillFormValues>({
    mutationKey: ["expense-bills", "make"],
    mutationFn: async (values) => unwrap(await makeExpenseFixedBill(values)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_CANDIDATES_KEY }),
  });
}

/** Converts the subscriptions picked in the bulk dialog. */
export function useConvertSubscriptions() {
  const queryClient = useQueryClient();
  return useMutation<
    ConvertSubscriptionsResult,
    ActionError,
    ConvertSubscriptionsValues
  >({
    mutationKey: ["expense-bills", "convert"],
    mutationFn: async (values) => {
      const result = await convertSubscriptions(values);
      unwrap(result);
      if (!result.ok || !result.converted) {
        throw new ActionError("Something went wrong. Please try again.");
      }
      return result.converted;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_CANDIDATES_KEY }),
  });
}
