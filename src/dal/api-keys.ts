import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import { insertApiKey, revokeApiKey, selectApiKeys } from "@/db/api-keys";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "@/lib/api-key-token";

/** The signed-in user's working API keys (never the keys themselves). */
export const getApiKeys = cache(async () => {
  const userId = await requireUserId();
  return selectApiKeys(userId);
});

/** Creates a key and returns it. It's stored hashed, so this is the only time it's seen. */
export async function createApiKey(name: string) {
  const userId = await currentUserIdOrThrow();
  const key = generateApiKey();
  await insertApiKey(userId, {
    name,
    keyHash: hashApiKey(key),
    keyPrefix: apiKeyPrefix(key),
  });
  return key;
}

export async function revokeKey(id: string) {
  const userId = await currentUserIdOrThrow();
  if (!(await revokeApiKey(userId, id))) {
    throw new NotFoundError("That key was already revoked.");
  }
}
