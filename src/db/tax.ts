import "server-only";
import { db } from "@/db/client";
import type { MonthTax } from "@/lib/tax";

/** Raw SQL for tax read off receipts. Callers (the DAL) handle auth and rules. */

/**
 * Tax paid per month between `from` and `to`, from the user's receipts that
 * have a tax amount. A receipt split across categories is saved as several
 * expenses but counted once, in the month of its earliest expense. Months
 * without receipts are left out.
 */
export async function selectReceiptTaxByMonth(
  userId: string,
  from: string,
  to: string,
): Promise<MonthTax[]> {
  const rows = await db()`
    with receipt_month as (
      select r.id, r.tax_cents, min(e.month) as month
      from receipts r
      join expenses e on e.receipt_id = r.id and e.user_id = ${userId}
      where r.user_id = ${userId} and r.tax_cents is not null
      group by r.id, r.tax_cents
    )
    select month, sum(tax_cents) as tax_cents, count(*) as receipts
    from receipt_month
    where month between ${from} and ${to}
    group by month
    order by month
  `;
  return rows.map((r) => ({
    month: String(r.month),
    taxCents: Number(r.tax_cents),
    receipts: Number(r.receipts),
  }));
}
