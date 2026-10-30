import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { userDataTag } from "@/db/cache-tags";
import { db, type Row } from "@/db/client";
import { receiptKindOf } from "@/lib/receipt-files";
import type { IncomeEntry } from "@/lib/types";

/** Raw SQL for the income table. Callers (the DAL) handle auth and rules. */

type IncomeValues = {
  month: string;
  label: string;
  amountCents: number;
  receivedOn: string | null;
};

function toDateString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const toIncomeEntry = (r: Row): IncomeEntry => ({
  id: r.id,
  month: String(r.month),
  label: r.label,
  amountCents: Number(r.amount_cents),
  receivedOn: toDateString(r.received_on),
  payer: r.payer ?? null,
  receiptId: r.receipt_id ?? null,
  receiptKind: r.receipt_id
    ? receiptKindOf({
        fileKind: r.file_kind,
        imagePathname: r.image_pathname,
      })
    : null,
});

export async function selectIncomeBetween(
  userId: string,
  from: string,
  to: string,
): Promise<IncomeEntry[]> {
  "use cache";
  cacheTag(userDataTag(userId));
  cacheLife("minutes");
  const rows = await db()`
    select i.id, i.month, i.label, i.amount_cents, i.received_on, i.payer,
           r.id as receipt_id, r.file_kind, r.image_pathname
    from income i
    left join receipts r on r.id = i.receipt_id and r.user_id = i.user_id
    where i.user_id = ${userId} and i.month between ${from} and ${to}
    order by i.month desc, i.received_on desc nulls last, i.created_at desc
  `;
  return rows.map(toIncomeEntry);
}

/**
 * Take-home entries received between two days (inclusive), newest first. An
 * entry with no date counts as received on the first of its month.
 */
export async function selectIncomeReceivedBetween(
  userId: string,
  from: string,
  to: string,
): Promise<(IncomeEntry & { accountId: string | null })[]> {
  const rows = await db()`
    select i.id, i.month, i.label, i.amount_cents, i.received_on, i.payer,
           i.account_id, r.id as receipt_id, r.file_kind, r.image_pathname
    from income i
    left join receipts r on r.id = i.receipt_id and r.user_id = i.user_id
    where i.user_id = ${userId}
      and coalesce(i.received_on, to_date(i.month || '-01', 'YYYY-MM-DD'))
          between ${from}::date and ${to}::date
    order by coalesce(i.received_on, to_date(i.month || '-01', 'YYYY-MM-DD')) desc,
             i.created_at desc
  `;
  return rows.map((r) => ({
    ...toIncomeEntry(r),
    accountId: r.account_id ?? null,
  }));
}

export async function selectLatestIncome(
  userId: string,
): Promise<IncomeEntry | null> {
  const [row] = await db()`
    select id, month, label, amount_cents, received_on
    from income
    where user_id = ${userId}
    order by month desc, created_at desc
    limit 1
  `;
  return row ? toIncomeEntry(row) : null;
}

export async function insertIncome(userId: string, values: IncomeValues) {
  await db()`
    insert into income (user_id, month, label, amount_cents, received_on)
    values (${userId}, ${values.month}, ${values.label}, ${values.amountCents}, ${values.receivedOn})
  `;
}

/** Returns false when no row matched (missing, or not this user's). */
export async function updateIncomeRow(
  userId: string,
  id: string,
  values: IncomeValues,
): Promise<boolean> {
  const rows = await db()`
    update income
    set month = ${values.month}, label = ${values.label},
        amount_cents = ${values.amountCents}, received_on = ${values.receivedOn}
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/** Returns false when no row matched (missing, or not this user's). */
export async function deleteIncomeRow(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    delete from income where id = ${id} and user_id = ${userId} returning id
  `;
  return rows.length > 0;
}
