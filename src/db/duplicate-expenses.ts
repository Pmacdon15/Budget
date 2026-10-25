import "server-only";
import { db } from "@/db/client";
import type {
  DuplicateCheck,
  DuplicateExpense,
} from "@/lib/duplicate-expenses";

/** Raw SQL for the duplicate check. The DAL supplies the signed-in user. */

/**
 * The newest of this user's expenses on `spentOn` whose total is `amountCents`
 * and whose description or receipt merchant matches (ignoring case and
 * surrounding spaces). The parts of a split receipt are added together, so a
 * receipt scanned twice is caught even when it was split.
 */
export async function selectDuplicateExpense(
  userId: string,
  check: DuplicateCheck,
): Promise<DuplicateExpense | null> {
  const description = check.description.trim().toLowerCase();
  const merchant = check.merchant?.trim().toLowerCase() || null;
  const rows = await db()`
    select min(e.description) as description,
           sum(e.amount_cents)::int as amount_cents,
           bool_or(e.receipt_id is not null) as scanned
    from expenses e
    left join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
    where e.user_id = ${userId} and e.spent_on = ${check.spentOn}
    group by coalesce(e.receipt_id, e.id)
    having sum(e.amount_cents) = ${check.amountCents}
       and (bool_or(lower(btrim(e.description)) = ${description})
            or bool_or(lower(btrim(r.merchant)) = ${merchant}))
    order by max(e.created_at) desc
    limit 1
  `;
  const [row] = rows;
  if (!row) return null;
  return {
    description: row.description,
    spentOn: check.spentOn,
    amountCents: Number(row.amount_cents),
    scanned: Boolean(row.scanned),
  };
}
