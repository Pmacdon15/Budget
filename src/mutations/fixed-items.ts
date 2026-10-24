"use client";

import { useMutation } from "@tanstack/react-query";
import {
  createFixedItem,
  stopFixedItem,
  updateFixedItem,
} from "@/actions/fixed-items";
import type { FixedItemFormValues } from "@/lib/schemas";
import { type ActionError, unwrap } from "@/mutations/action-error";

/** Creates a fixed bill, or updates `id` when given. */
export function useSaveFixedItem(id?: string) {
  return useMutation<void, ActionError, FixedItemFormValues>({
    mutationKey: ["fixed-items", id ? "update" : "create", id],
    mutationFn: async (values) =>
      unwrap(
        await (id ? updateFixedItem(id, values) : createFixedItem(values)),
      ),
  });
}

export function useStopFixedItem() {
  return useMutation<void, ActionError, { id: string; fromMonth: string }>({
    mutationKey: ["fixed-items", "stop"],
    mutationFn: async ({ id, fromMonth }) =>
      unwrap(await stopFixedItem(id, fromMonth)),
  });
}
