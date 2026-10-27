import "server-only";
import { db, type Row } from "@/db/client";
import { receiptJson } from "@/db/pending-expenses";
import type { ReceiptSource } from "@/db/receipt-files";
import type { ReceiptDetails } from "@/lib/pending-expenses";
import type { IncomeDuplicateMatch, PendingIncome } from "@/lib/pending-income";
import { receiptKindOf } from "@/lib/receipt-files";

/** Raw SQL for income waiting for review. Callers handle auth and rules. */

export type PendingIncomeValues = {
  receivedOn: string;
  label: string;
  payer: string | null;
  amountCents: number;
  accountId: string | null;
  source: string | null;
  client: string | null;
  receipt: ReceiptDetails | null;
};

const toDateString = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").slice(0, 10);

const toIso = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

const toPendingIncome = (r: Row): PendingIncome => ({
  id: String(r.id),
  receivedOn: toDateString(r.received_on),
  label: r.label,
  payer: r.payer ?? null,
  amountCents: Number(r.amount_cents),
  accountId: r.account_id ?? null,
  accountName: r.account_name ?? null,
  source: r.source ?? null,
  client: r.client ?? null,
  createdAt: toIso(r.created_at),
  possibleDuplicate: Boolean(r.possible_duplicate),
  hasReceipt: r.receipt != null,
  receiptKind:
    r.receipt == null
      ? null
      : receiptKindOf({
          fileKind: r.receipt.file_kind,
          imagePathname: r.receipt.image_pathname,
        }),
});

/** Saves income for review and returns its id. */
export async function insertPendingIncome(
  userId: string,
  values: PendingIncomeValues,
): Promise<string> {
  const [row] = await db()`
    insert into pending_income (user_id, received_on, label, payer,
                                amount_cents, account_id, source, client,
                                receipt)
    values (${userId}, ${values.receivedOn}, ${values.label}, ${values.payer},
            ${values.amountCents}, ${values.accountId}::uuid, ${values.source},
            ${values.client},
            ${values.receipt ? receiptJson(values.receipt) : null}::jsonb)
    returning id
  `;
  return String(row?.id);
}

/** This user's income waiting for review, oldest first. */
export async function selectPendingIncomeList(
  userId: string,
): Promise<PendingIncome[]> {
  const rows = await db()`
    select p.id, p.received_on, p.label, p.payer, p.amount_cents,
           p.account_id, a.name as account_name, p.source, p.client,
           p.created_at, p.receipt,
           exists (
             select 1 from income i
             where i.user_id = p.user_id and i.received_on = p.received_on
               and i.amount_cents = p.amount_cents
           ) as possible_duplicate
    from pending_income p
    left join accounts a on a.id = p.account_id and a.user_id = p.user_id
    where p.user_id = ${userId}
    order by p.created_at asc, p.id asc
  `;
  return rows.map(toPendingIncome);
}

/** One income item waiting for review, or null. */
export async function selectPendingIncomeItem(
  userId: string,
  id: string,
): Promise<PendingIncome | null> {
  return (
    (await selectPendingIncomeList(userId)).find((p) => p.id === id) ?? null
  );
}

export async function countPendingIncome(userId: string): Promise<number> {
  const [row] = await db()`
    select count(*)::int as n from pending_income where user_id = ${userId}
  `;
  return Number(row?.n ?? 0);
}

const toMatch = (r: Row): IncomeDuplicateMatch => ({
  kind: r.kind === "pending" ? "pending" : "income",
  id: String(r.id),
  label: String(r.label),
  receivedOn: toDateString(r.received_on),
  amountCents: Number(r.amount_cents),
});

/**
 * A take-home entry, or income already waiting for review, on `receivedOn`
 * with the same amount. The payer isn't compared: a deposit and its e-Transfer
 * notice name it differently, so the same amount on the same day is enough
 * to ask.
 */
export async function selectIncomeDuplicateMatch(
  userId: string,
  receivedOn: string,
  amountCents: number,
): Promise<IncomeDuplicateMatch | null> {
  const rows = await db()`
    select * from (
      select 'income' as kind, i.id, i.label, i.received_on, i.amount_cents,
             i.created_at
      from income i
      where i.user_id = ${userId} and i.received_on = ${receivedOn}
        and i.amount_cents = ${amountCents}
      union all
      select 'pending', p.id, p.label, p.received_on, p.amount_cents,
             p.created_at
      from pending_income p
      where p.user_id = ${userId} and p.received_on = ${receivedOn}
        and p.amount_cents = ${amountCents}
    ) matches
    order by kind = 'income' desc, created_at desc
    limit 1
  `;
  return rows[0] ? toMatch(rows[0]) : null;
}

/**
 * Income (saved or waiting for review) already holding a receipt from this
 * email or file: re-sending the same e-Transfer email is a duplicate. A
 * content hash on both sides decides; otherwise the Message-ID does.
 */
export async function selectIncomeReceiptSourceMatch(
  userId: string,
  source: ReceiptSource,
): Promise<IncomeDuplicateMatch | null> {
  if (!source.messageId && !source.contentHash) return null;
  const rows = await db()`
    select * from (
      select 'income' as kind, i.id, i.label, i.received_on, i.amount_cents,
             i.created_at
      from income i
      join receipts r on r.id = i.receipt_id and r.user_id = i.user_id
      where i.user_id = ${userId}
        and case when ${source.contentHash}::text is not null
                      and r.content_hash is not null
                 then r.content_hash = ${source.contentHash}
                 else ${source.messageId}::text is not null
                      and r.email_message_id = ${source.messageId} end
      union all
      select 'pending', p.id, p.label, p.received_on, p.amount_cents,
             p.created_at
      from pending_income p
      where p.user_id = ${userId} and p.receipt is not null
        and case when ${source.contentHash}::text is not null
                      and p.receipt->>'content_hash' is not null
                 then p.receipt->>'content_hash' = ${source.contentHash}
                 else ${source.messageId}::text is not null
                      and p.receipt->>'email_message_id' = ${source.messageId} end
    ) found
    order by created_at desc
    limit 1
  `;
  return rows[0] ? toMatch(rows[0]) : null;
}

/** Whether `accountId` is one of this user's chequing or savings accounts. */
export async function isDepositAccount(
  userId: string,
  accountId: string,
): Promise<boolean> {
  const rows = await db()`
    select 1 from accounts
    where id = ${accountId} and user_id = ${userId}
      and type in ('chequing', 'savings')
  `;
  return rows.length > 0;
}

/**
 * Turns the item into a take-home entry for its month and removes it from
 * review, in one statement, so approving twice can never save it twice. An
 * attached receipt becomes a receipts row linked to the entry. The entry goes
 * into the item's account, or the primary chequing account when it names
 * none (or that account was deleted). Returns null when no row matched
 * (missing, already handled, or not this user's).
 */
export async function approvePendingIncome(
  userId: string,
  id: string,
): Promise<{ incomeId: string } | null> {
  const rows = await db()`
    with taken as (
      delete from pending_income
      where id = ${id} and user_id = ${userId}
      returning user_id, received_on, to_char(received_on, 'YYYY-MM') as month,
                label, payer, amount_cents, account_id, source, receipt
    ),
    target_account as (
      select a.id
      from taken t
      join accounts a
        on a.user_id = t.user_id
       and (a.id = t.account_id or (t.account_id is null and a.is_primary))
      limit 1
    ),
    saved_receipt as (
      insert into receipts (user_id, merchant, purchased_on, subtotal_cents,
                            tax_cents, total_cents, raw_text, image_pathname,
                            file_pathname, file_kind, file_name, file_bytes,
                            email_subject, email_from, email_date,
                            email_message_id, content_hash, currency)
      select user_id, coalesce(receipt->>'merchant', payer),
             (receipt->>'purchased_on')::date,
             (receipt->>'subtotal_cents')::int, (receipt->>'tax_cents')::int,
             (receipt->>'total_cents')::int, receipt->>'raw_text',
             receipt->>'image_pathname', receipt->>'file_pathname',
             receipt->>'file_kind', receipt->>'file_name',
             (receipt->>'file_bytes')::int, receipt->>'email_subject',
             receipt->>'email_from', receipt->>'email_date',
             receipt->>'email_message_id', receipt->>'content_hash',
             receipt->>'currency'
      from taken
      where receipt is not null
      returning id
    ),
    saved as (
      insert into income (user_id, month, label, amount_cents, received_on,
                          receipt_id, account_id, payer, source)
      select user_id, month, label, amount_cents, received_on,
             (select id from saved_receipt limit 1),
             (select id from target_account),
             payer, source
      from taken
      returning id
    )
    select id from saved
  `;
  const [row] = rows;
  return row ? { incomeId: String(row.id) } : null;
}

/**
 * Removes the item without saving it. Its receipt copy, now unused, is
 * removed by the receipt cleanup job, as for a rejected expense. Returns
 * false when no row matched (missing, or not this user's).
 */
export async function deletePendingIncome(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    delete from pending_income where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}
