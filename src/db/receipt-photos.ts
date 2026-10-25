import "server-only";
import { db } from "@/db/client";
import type { ReceiptPhotoRow } from "@/lib/receipt-photos";

/** Raw SQL for the receipt-photo zip. Callers (the DAL) handle auth and rules. */

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

/**
 * The user's receipts that have a photo and at least one expense part in the
 * month range and categories, oldest first. A receipt split across several
 * categories comes back once. Reads at most `limit` rows.
 */
export async function selectReceiptPhotos(
  userId: string,
  from: string,
  to: string,
  categories: string[],
  limit: number,
): Promise<ReceiptPhotoRow[]> {
  const rows = await db()`
    select r.id, r.merchant,
           coalesce(r.purchased_on, min(e.spent_on)) as photo_date,
           min(e.description) as description
    from receipts r
    join expenses e on e.receipt_id = r.id and e.user_id = r.user_id
    where r.user_id = ${userId}
      and r.image_pathname is not null
      and e.month between ${from} and ${to}
      and e.category = any(${categories})
    group by r.id
    order by photo_date asc, r.created_at asc, r.id asc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: String(r.id),
    date: toDateString(r.photo_date),
    merchant: r.merchant ?? null,
    description: String(r.description ?? ""),
  }));
}
