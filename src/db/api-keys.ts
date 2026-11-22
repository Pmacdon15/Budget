import "server-only";
import { db, type Row } from "@/db/client";
import type { ApiKey } from "@/lib/api-keys";

/** Raw SQL for personal API keys. Callers handle auth. Keys are stored hashed. */

const toIso = (value: unknown) =>
  value == null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(String(value)).toISOString();

export const MAX_API_KEYS = 25;

/**
 * Inserts a new API key if the user has fewer than `MAX_API_KEYS` active keys.
 * Returns false when the limit is already reached.
 *
 * The count and the insert must not race: under READ COMMITTED, two requests
 * that each count 24 keys would both insert. So both run in one transaction
 * that first takes a per-user advisory lock (released at commit). A second
 * request waits on the lock, and because each statement in a READ COMMITTED
 * transaction takes a fresh snapshot, its insert then counts the key the first
 * one committed. The lock is a separate statement, not a CTE, so it is
 * certainly held before the count runs.
 */
export async function insertApiKey(
  userId: string,
  values: { name: string; keyHash: string; keyPrefix: string },
): Promise<boolean> {
  const [, rows] = await db().transaction(
    (sql) => [
      sql`select pg_advisory_xact_lock(hashtext('api_keys'), hashtext(${userId}))`,
      sql`
        insert into api_keys (user_id, name, key_hash, key_prefix)
        select ${userId}, ${values.name}, ${values.keyHash}, ${values.keyPrefix}
        where (
          select count(*) from api_keys
          where user_id = ${userId} and revoked_at is null
        ) < ${MAX_API_KEYS}
        returning id
      `,
    ],
    // Must stay READ COMMITTED: a REPEATABLE READ snapshot would be taken at
    // the lock and miss keys committed while this request waited for it.
    { isolationLevel: "ReadCommitted" },
  );
  return (rows as Row[]).length > 0;
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
