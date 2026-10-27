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

const toEntry = (r: Row): ReceiptLibraryEntry => ({
  id: r.id,
  merchant: r.merchant ?? null,
  date: toDateString(
    r.purchased_on ?? r.spent_on ?? r.received_on ?? r.created_at,
  ),
  month: String(
    r.month ?? r.income_month ?? toDateString(r.created_at).slice(0, 7),
  ),
  totalCents: Number(r.total_cents ?? r.spent_cents ?? r.income_cents ?? 0),
  taxCents: r.tax_cents == null ? null : Number(r.tax_cents),
  descriptions:
    (r.descriptions ?? []).length > 0 || r.income_label == null
      ? ((r.descriptions ?? []) as string[])
      : [String(r.income_label)],
  categories: (r.categories ?? []) as string[],
  hasPhoto: Boolean(r.has_photo),
  kind: receiptKindOf({ fileKind: r.file_kind, imagePathname: r.has_photo }),
});

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
           inc.amount_cents as income_cents, inc.label as income_label
    from receipts r
    left join expenses e on e.receipt_id = r.id and e.user_id = r.user_id
    left join lateral (
      select i.received_on, i.month, i.amount_cents, i.label
      from income i
      where i.receipt_id = r.id and i.user_id = r.user_id
      order by i.created_at
      limit 1
    ) inc on true
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
      )
    group by r.id, inc.received_on, inc.month, inc.amount_cents, inc.label
    order by coalesce(r.purchased_on, min(e.spent_on), inc.received_on,
                      r.created_at::date) desc,
             r.created_at desc
    limit ${limit}
  `;
  return rows.map(toEntry);
}
