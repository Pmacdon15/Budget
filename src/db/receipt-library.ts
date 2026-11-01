import "server-only";
import { db, type Row } from "@/db/client";
import { type ReceiptKind, receiptKindOf } from "@/lib/receipt-files";
import { containsPattern } from "@/lib/schemas/receipt-library";

/**
 * One scanned receipt in the library. The photo's blob pathname stays on the
 * server: the page only learns whether there is a photo, and links to the
 * owner-checked image route by receipt id.
 */
export type ReceiptLibraryEntry = {
  id: string;
  merchant: string | null;
  /** The date read off the receipt, else the expense's (or deposit's) date. */
  date: string;
  /** The month of the expense(s) saved with it, for linking to Spending. */
  month: string;
  /** The total read off the receipt, else what was saved as spending. */
  totalCents: number;
  taxCents: number | null;
  descriptions: string[];
  categories: string[];
  hasPhoto: boolean;
  /** What it shows: a photo, a PDF or email copy, or only details. */
  kind: ReceiptKind;
};

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

const toEntry = (r: Row): ReceiptLibraryEntry => {
  const descriptions: string[] =
    (r.descriptions ?? []).length > 0
      ? ((r.descriptions ?? []) as string[])
      : r.income_label != null
        ? [String(r.income_label)]
        : r.bill_name != null
          ? [String(r.bill_name)]
          : [];
  const categories: string[] =
    (r.categories ?? []).length > 0
      ? ((r.categories ?? []) as string[])
      : r.bill_category != null
        ? [String(r.bill_category)]
        : [];
  return {
    id: String(r.id),
    merchant: r.merchant ?? (r.bill_name ? String(r.bill_name) : null),
    date: toDateString(
      r.purchased_on ??
        r.spent_on ??
        r.received_on ??
        r.bill_paid_on ??
        r.created_at,
    ),
    month: String(
      r.month ??
        r.income_month ??
        r.bill_month ??
        (r.purchased_on
          ? toDateString(r.purchased_on).slice(0, 7)
          : toDateString(r.created_at).slice(0, 7)),
    ),
    totalCents: Number(
      r.total_cents ?? r.spent_cents ?? r.income_cents ?? r.bill_cents ?? 0,
    ),
    taxCents: r.tax_cents == null ? null : Number(r.tax_cents),
    descriptions,
    categories,
    hasPhoto: Boolean(r.has_photo),
    kind: receiptKindOf({
      fileKind: r.file_kind,
      imagePathname: r.has_photo,
    }),
  };
};

/**
 * This user's receipts, newest first: one row per receipt even when it was
 * split across categories. A receipt can belong to expenses or to a
 * take-home entry (e.g. the e-Transfer email for a payment received).
 * `search` matches the merchant, any of its expenses' descriptions or its
 * take-home entry's label, case-insensitively.
 */
export async function selectReceiptLibrary(
  userId: string,
  search: string,
  limit: number,
  month?: string | null,
): Promise<ReceiptLibraryEntry[]> {
  const pattern = containsPattern(search);
  const rows = await db()`
    select r.id, r.merchant, r.purchased_on, r.total_cents, r.tax_cents,
           r.created_at, (r.image_pathname is not null) as has_photo,
           r.file_kind,
           min(e.spent_on) as spent_on, min(e.month) as month,
           sum(e.amount_cents) as spent_cents,
           coalesce(array_agg(distinct e.description) filter (where e.id is not null), '{}') as descriptions,
           coalesce(array_agg(distinct e.category) filter (where e.id is not null), '{}') as categories,
           inc.received_on, inc.month as income_month,
           inc.amount_cents as income_cents, inc.label as income_label,
           bill.paid_on as bill_paid_on, bill.month as bill_month,
           bill.amount_cents as bill_cents, bill.bill_name, bill.bill_category
    from receipts r
    left join expenses e on e.receipt_id = r.id and e.user_id = r.user_id
    left join lateral (
      select i.received_on, i.month, i.amount_cents, i.label
      from income i
      where i.receipt_id = r.id and i.user_id = r.user_id
      order by i.created_at
      limit 1
    ) inc on true
    left join lateral (
      select coalesce(p.paid_on, pe.spent_on) as paid_on,
             p.month,
             coalesce(p.amount_cents, pe.amount_cents, f.amount_cents) as amount_cents,
             f.name as bill_name,
             f.category as bill_category
      from fixed_item_payments p
      join fixed_items f on f.id = p.fixed_item_id and f.user_id = p.user_id
      left join expenses pe on pe.id = p.expense_id and pe.user_id = p.user_id
      where (p.receipt_id = r.id or pe.receipt_id = r.id) and p.user_id = r.user_id
      order by p.created_at
      limit 1
    ) bill on true
    where r.user_id = ${userId}
      and (
        ${search} = ''
        or r.merchant ilike ${pattern} escape '\\'
        or exists (
          select 1 from expenses d
          where d.receipt_id = r.id and d.user_id = r.user_id
            and d.description ilike ${pattern} escape '\\'
        )
        or exists (
          select 1 from income d
          where d.receipt_id = r.id and d.user_id = r.user_id
            and d.label ilike ${pattern} escape '\\'
        )
        or exists (
          select 1 from fixed_item_payments p2
          join fixed_items f2 on f2.id = p2.fixed_item_id and f2.user_id = p2.user_id
          left join expenses pe2 on pe2.id = p2.expense_id and pe2.user_id = p2.user_id
          where (p2.receipt_id = r.id or pe2.receipt_id = r.id) and p2.user_id = r.user_id
            and f2.name ilike ${pattern} escape '\\'
        )
      )
    group by r.id, inc.received_on, inc.month, inc.amount_cents, inc.label,
             bill.paid_on, bill.month, bill.amount_cents, bill.bill_name, bill.bill_category
    having (${month ?? null}::text is null
            or coalesce(min(e.month), inc.month, bill.month,
                        substring(r.purchased_on::text from 1 for 7),
                        substring(r.created_at::text from 1 for 7)) = ${month})
    order by coalesce(r.purchased_on, min(e.spent_on), inc.received_on, bill.paid_on,
                      r.created_at::date) desc,
             r.created_at desc
    limit ${limit}
  `;
  return rows.map(toEntry);
}
