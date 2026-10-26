"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/api-keys";
import { type ApiKeyNameFormValues, apiKeyNameSchema } from "@/lib/api-keys";
import { idSchema } from "@/lib/schemas";
import type { ActionResult } from "@/lib/types";

/** On success, the new key: shown once, since only its hash is kept. */
export type CreatedKeyResult =
  | { ok: true; key: string }
  | Exclude<ActionResult, { ok: true }>;

export async function createApiKey(
  values: ApiKeyNameFormValues,
): Promise<CreatedKeyResult> {
  let key = "";
  const result = await runAction(async () => {
    key = await dal.createApiKey(apiKeyNameSchema.parse(values).name);
  });
  return result.ok ? { ok: true, key } : result;
}

export async function revokeApiKey(id: string) {
  return runAction(async () => {
    await dal.revokeKey(idSchema.parse(id));
  });
}
