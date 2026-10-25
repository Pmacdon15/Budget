import "server-only";
import { db } from "@/db/client";
import type { MerchantChoice } from "@/lib/merchant-memory";

/** Raw SQL for merchant memory. Callers (the DAL) handle auth. */

/**
 * The user's most recent expense lines with the merchant read off their
 * receipt, newest first. Within one split receipt (saved together) the largest
 * part comes first, so it is the category remembered for that merchant.
 */
export async function selectRecentMerchantChoices(
  userId: string,
  limit: number,
): Promise<MerchantChoice[]> {
  const rows = await db()`
    select e.description, r.merchant, e.category
    from expenses e
    left join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
    where e.user_id = ${userId}
    order by e.created_at desc, e.amount_cents desc, e.id
    limit ${limit}
  `;
  return rows.map((r) => ({
    description: String(r.description),
    merchant: r.merchant == null ? null : String(r.merchant),
    category: String(r.category),
  }));
}
