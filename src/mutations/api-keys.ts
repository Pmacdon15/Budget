"use client";

import { useMutation } from "@tanstack/react-query";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";
import type { ApiKeyNameFormValues } from "@/lib/api-keys";
import { ActionError, unwrap } from "@/mutations/action-error";

/** Resolves with the new key, which is only ever shown this once. */
export function useCreateApiKey() {
  return useMutation<string, ActionError, ApiKeyNameFormValues>({
    mutationKey: ["api-keys", "create"],
    mutationFn: async (values) => {
      const result = await createApiKey(values);
      if (!result.ok) throw new ActionError(result.error, result.fieldErrors);
      return result.key;
    },
  });
}

export function useRevokeApiKey() {
  return useMutation<void, ActionError, string>({
    mutationKey: ["api-keys", "revoke"],
    mutationFn: async (id) => unwrap(await revokeApiKey(id)),
  });
}
