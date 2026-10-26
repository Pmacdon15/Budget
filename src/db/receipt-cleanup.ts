import "server-only";
import { db } from "@/db/client";

/** Raw SQL for the unattached-photo cleanup job. It runs for every user, not one. */

/**
 * Which of `pathnames` are still in use: saved with a receipt, attached by an
 * AI to an item waiting on the Review page, or held by an undo entry younger
 * than `undoWindowMinutes` that could bring one back.
 */
export async function selectPhotosInUse(
  pathnames: string[],
  undoWindowMinutes: number,
): Promise<Set<string>> {
  if (pathnames.length === 0) return new Set();
  const rows = await db()`
    select p.pathname
    from unnest(${pathnames}::text[]) as p (pathname)
    where exists (
        select 1 from receipts r where r.image_pathname = p.pathname
      )
      or exists (
        select 1 from pending_expenses pe
        where pe.receipt->>'image_pathname' = p.pathname
      )
      or exists (
        select 1 from undo_deletes u
        where u.created_at > now() - make_interval(mins => ${undoWindowMinutes}::int)
          and (u.image_pathname = p.pathname
            or u.receipt->>'image_pathname' = p.pathname)
      )
  `;
  return new Set(rows.map((row) => String(row.pathname)));
}
