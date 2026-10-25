"use client";

import { useMutation } from "@tanstack/react-query";
import { markBillPaid, unmarkBillPaid } from "@/actions/bill-payments";
import { type ActionError, unwrap } from "@/mutations/action-error";

type Variables = { fixedItemId: string; month: string; paid: boolean };

/** Marks a bill paid for a month (`paid: true`) or takes the mark off. */
export function useSetBillPaid() {
  return useMutation<void, ActionError, Variables>({
    mutationKey: ["bill-payments", "set"],
    mutationFn: async ({ paid, ...values }) =>
      unwrap(await (paid ? markBillPaid(values) : unmarkBillPaid(values))),
  });
}
