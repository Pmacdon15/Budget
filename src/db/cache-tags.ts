import "server-only";

/**
 * Cache tags for the `"use cache"` reads in this folder.
 *
 * The db layer is the right place to cache: these functions take `userId` as a
 * plain argument and never touch `cookies()`, `headers()` or `searchParams`, so
 * they can sit in a `"use cache"` scope. The DAL can't: it reads the session,
 * and a request read inside a cached scope throws `next-request-in-use-cache`.
 * See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
 *
 * Tags are stored in plain text, so they key on the Clerk user id and nothing
 * else — no tokens, emails or amounts.
 */

/**
 * Everything cached for one user. Coarse on purpose: it matches the
 * `revalidatePath("/", "layout")` that already follows every mutation, so a
 * write can't leave one of these reads behind. Finer per-table tags can be
 * added later without changing the call sites that invalidate this one.
 */
export const userDataTag = (userId: string) => `user-data:${userId}`;
