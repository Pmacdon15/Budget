"use client";

import { useMutation } from "@tanstack/react-query";
import { saveRollover } from "@/actions/rollover";
import type { RolloverFormValues } from "@/lib/rollover";
import { type ActionError, unwrap } from "@/mutations/action-error";

export function useSaveRollover() {
  return useMutation<void, ActionError, RolloverFormValues>({
    mutationKey: ["rollover", "save"],
    mutationFn: async (values) => unwrap(await saveRollover(values)),
  });
}
