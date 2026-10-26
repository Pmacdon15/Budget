import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { API_KEY_PREFIX } from "@/lib/api-keys";

/** A new key: the prefix plus 32 random bytes, URL-safe. Shown to the user once. */
export function generateApiKey() {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** What's stored instead of the key. A SHA-256 is enough: the key is 256 random bits. */
export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** The part shown in the list of keys. */
export const apiKeyPrefix = (key: string) =>
  key.slice(0, API_KEY_PREFIX.length + 6);

export const looksLikeApiKey = (token: string) =>
  token.startsWith(API_KEY_PREFIX);
