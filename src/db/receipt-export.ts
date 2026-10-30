import "server-only";
import { db } from "@/db/client";
import type { ExpenditureRow } from "@/lib/receipt-export";
import { isReceiptFileKind, receiptKindOf } from "@/lib/receipt-files";

/** Raw SQL for the receipts .zip. Callers (the DAL) handle auth and rules. */

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

const nullableNumber = (value: unknown) =>
  value == null ? null : Number(value);

/**
 * Everything the user spent between two days (both included), oldest first:
 *
 * - every expense on those days, paid or not, split receipts as one row per
 *   part (the receipt's subtotal and tax shared in proportion), and
 * - every fixed bill marked paid on those days, on the day it was paid (or
 *   its due day, for a bill marked paid before payments had a day).
 *
 * An expense that paid a fixed bill is listed once, as the bill, so nothing
 * is counted twice. Its receipt is the bill payment's own, else the paying
 * expense's. Saved receipts' pathnames never leave this function.
 */
export async function selectExpenditures(
  userId: string,
  from: string,
  to: string,
): Promise<ExpenditureRow[]> {
  const rows = await db()`
    select * from (
      select 'expense' as kind, e.id::text as id, e.spent_on as day,
             e.description, e.category, e.amount_cents, e.unpaid,
             r.merchant,
             round(r.subtotal_cents::numeric * e.amount_cents / nullif(parts.spend, 0))::int as subtotal_cents,
             round(r.tax_cents::numeric * e.amount_cents / nullif(parts.spend, 0))::int as tax_cents,
             a.name as account,
             r.id as receipt_id, r.file_kind, r.file_name,
             (r.image_pathname is not null) as has_photo,
             (r.file_pathname is not null) as has_file,
             e.created_at
      from expenses e
      left join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
      left join lateral (
        select sum(x.amount_cents) as spend
        from expenses x
        where x.receipt_id = e.receipt_id and x.user_id = e.user_id
      ) parts on e.receipt_id is not null
      left join accounts a on a.id = e.account_id and a.user_id = e.user_id
      where e.user_id = ${userId}
        and e.spent_on between ${from}::date and ${to}::date
        and not exists (
          select 1 from fixed_item_payments p
          where p.expense_id = e.id and p.user_id = e.user_id
        )

      union all

      select 'bill', p.fixed_item_id::text || ':' || p.month,
             coalesce(
               p.paid_on,
               pe.spent_on,
               (p.month || '-01')::date + (least(
                 coalesce(f.due_day, 1),
                 extract(day from ((p.month || '-01')::date
                                   + interval '1 month - 1 day'))::int
               ) - 1)
             ),
             f.name, f.category,
             coalesce(p.amount_cents, pe.amount_cents, f.amount_cents),
             false,
             coalesce(r.merchant, f.merchant),
             r.subtotal_cents, r.tax_cents,
             a.name,
             r.id, r.file_kind, r.file_name,
             (r.image_pathname is not null),
             (r.file_pathname is not null),
             p.created_at
      from fixed_item_payments p
      join fixed_items f on f.id = p.fixed_item_id and f.user_id = p.user_id
      left join expenses pe on pe.id = p.expense_id and pe.user_id = p.user_id
      left join receipts r
        on r.id = coalesce(p.receipt_id, pe.receipt_id) and r.user_id = p.user_id
      left join accounts a on a.id = pe.account_id and a.user_id = p.user_id
      where p.user_id = ${userId}
    ) spending
    where day between ${from}::date and ${to}::date
    order by day asc, created_at asc, id asc
  `;
  return rows.map((r) => {
    const receiptId = r.receipt_id == null ? null : String(r.receipt_id);
    return {
      id: String(r.id),
      kind: r.kind === "bill" ? "bill" : "expense",
      date: toDateString(r.day),
      description: String(r.description ?? ""),
      category: String(r.category ?? ""),
      amountCents: Number(r.amount_cents ?? 0),
      merchant: r.merchant ?? null,
      subtotalCents: nullableNumber(r.subtotal_cents),
      taxCents: nullableNumber(r.tax_cents),
      unpaid: Boolean(r.unpaid),
      account: r.account ?? null,
      receiptId,
      receiptKind: receiptId
        ? receiptKindOf({
            // As the file routes serve it: a file kind only with a file.
            fileKind:
              r.has_file && isReceiptFileKind(r.file_kind) ? r.file_kind : null,
            imagePathname: r.has_photo,
          })
        : null,
      receiptFileName: r.file_name ?? null,
    } satisfies ExpenditureRow;
  });
}
