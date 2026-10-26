import "server-only";
import { db } from "@/db/client";
import type { ApiKey } from "@/lib/api-keys";

/** Raw SQL for personal API keys. Callers handle auth. Keys are stored hashed. */

const toIso = (value: unknown) =>
  value == null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(String(value)).toISOString();

export async function insertApiKey(
  userId: string,
  values: { name: string; keyHash: string; keyPrefix: string },
) {
  await db()`
    insert into api_keys (user_id, name, key_hash, key_prefix)
    values (${userId}, ${values.name}, ${values.keyHash}, ${values.keyPrefix})
  `;
}

/** This user's keys that still work, newest first. */
export async function selectApiKeys(userId: string): Promise<ApiKey[]> {
  const rows = await db()`
    select id, name, key_prefix, created_at, last_used_at
    from api_keys
    where user_id = ${userId} and revoked_at is null
    order by created_at desc, id desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.key_prefix,
    createdAt: toIso(r.created_at) ?? "",
    lastUsedAt: toIso(r.last_used_at),
  }));
}

/** Returns false when no working key matched (missing, revoked, or not this user's). */
export async function revokeApiKey(userId: string, id: string) {
  const rows = await db()`
    update api_keys set revoked_at = now()
    where id = ${id} and user_id = ${userId} and revoked_at is null
    returning id
  `;
  return rows.length > 0;
}

/**
 * Whose key this hash is, if it hasn't been revoked, noting that it was used.
 * Returns the key's id, owner and name, or null.
 */
export async function touchApiKey(
  keyHash: string,
): Promise<{ id: string; userId: string; name: string } | null> {
  const rows = await db()`
    update api_keys set last_used_at = now()
    where key_hash = ${keyHash} and revoked_at is null
    returning id, user_id, name
  `;
  const [row] = rows;
  return row
    ? {
        id: String(row.id),
        userId: String(row.user_id),
        name: String(row.name),
      }
    : null;
}
