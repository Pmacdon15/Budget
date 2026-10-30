import "server-only";
import { db, type Row } from "@/db/client";
import type { ReplacedFiles } from "@/db/receipt-files";
import type {
  DuplicateMatch,
  PendingExpense,
  ReceiptDetails,
} from "@/lib/pending-expenses";
import { receiptKindOf } from "@/lib/receipt-files";

/** Raw SQL for expenses waiting for review. Callers handle auth and rules. */

export type PendingValues = {
  spentOn: string;
  description: string;
  merchant: string | null;
  category: string;
  amountCents: number;
  source: string | null;
  client: string | null;
  unpaid?: boolean;
  receipt?: ReceiptDetails | null;
  /** The fixed bill this item pays: approving links it and marks that month paid. */
  fixedItemId?: string | null;
  /** Whether it's a subscription, when the AI or the user said. Null: unknown. */
  isSubscription?: boolean | null;
  /** The account it was paid from, once the user confirmed it. */
  accountId?: string | null;
};

/** A receipt as stored in `pending_expenses.receipt`: the receipts table's column names. */
export const receiptJson = (r: ReceiptDetails) =>
  JSON.stringify({
    merchant: r.merchant,
    purchased_on: r.purchasedOn,
    subtotal_cents: r.subtotalCents,
    tax_cents: r.taxCents,
    total_cents: r.totalCents,
    raw_text: r.rawText,
    image_pathname: r.imagePathname,
    file_pathname: r.filePathname ?? null,
    file_kind: r.fileKind ?? null,
    file_name: r.fileName ?? null,
    file_bytes: r.fileBytes ?? null,
    email_subject: r.emailSubject ?? null,
    email_from: r.emailFrom ?? null,
    email_date: r.emailDate ?? null,
    email_message_id: r.emailMessageId ?? null,
    content_hash: r.contentHash ?? null,
    currency: r.currency ?? null,
  });

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value).slice(0, 10);
}

const toIso = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

const toPending = (r: Row): PendingExpense => ({
  id: r.id,
  spentOn: toDateString(r.spent_on),
  description: r.description,
  merchant: r.merchant ?? null,
  category: r.category,
  amountCents: Number(r.amount_cents),
  source: r.source ?? null,
  client: r.client ?? null,
  createdAt: toIso(r.created_at),
  possibleDuplicate: Boolean(r.possible_duplicate),
  unpaid: Boolean(r.unpaid),
  hasReceipt: r.receipt != null,
  receiptKind:
    r.receipt == null
      ? null
      : receiptKindOf({
          fileKind: r.receipt.file_kind,
          imagePathname: r.receipt.image_pathname,
        }),
  fixedItemId: r.fixed_item_id ?? null,
  fixedItemName: r.fixed_item_name ?? null,
  fixedItemAmountCents:
    r.fixed_item_amount_cents == null
      ? null
      : Number(r.fixed_item_amount_cents),
  fixedItemIsEstimate: Boolean(r.fixed_item_is_estimate),
  isSubscription: r.is_subscription == null ? null : Boolean(r.is_subscription),
  accountId: r.account_id ?? null,
  accountName: r.account_name ?? null,
});

/** Saves an item for review and returns its id. */
export async function insertPendingExpense(
  userId: string,
  values: PendingValues,
): Promise<string> {
  const [row] = await db()`
    insert into pending_expenses (user_id, spent_on, description, merchant,
                                  category, amount_cents, source, client,
                                  unpaid, receipt, fixed_item_id, is_subscription,
                                  account_id)
    values (${userId}, ${values.spentOn}, ${values.description}, ${values.merchant},
            ${values.category}, ${values.amountCents}, ${values.source}, ${values.client},
            ${values.unpaid ?? false},
            ${values.receipt ? receiptJson(values.receipt) : null}::jsonb,
            ${values.fixedItemId ?? null}, ${values.isSubscription ?? null}::boolean,
            ${values.accountId ?? null}::uuid)
    returning id
  `;
  return String(row?.id);
}

/** This user's items waiting for review, oldest first. */
export async function selectPendingExpenses(
  userId: string,
): Promise<PendingExpense[]> {
  const rows = await db()`
    select p.id, p.spent_on, p.description, p.merchant, p.category,
           p.amount_cents, p.source, p.client, p.created_at, p.unpaid,
           p.receipt, p.is_subscription,
           -- An account that's since been deleted reads as not chosen.
           acct.id as account_id, acct.name as account_name,
           bill.id as fixed_item_id, bill.name as fixed_item_name,
           bill.amount_cents as fixed_item_amount_cents,
           bill.is_estimate as fixed_item_is_estimate,
           exists (
             select 1 from expenses e
             where e.user_id = p.user_id and e.spent_on = p.spent_on
             group by coalesce(e.receipt_id, e.id)
             having sum(e.amount_cents) = p.amount_cents
           ) as possible_duplicate
    from pending_expenses p
    -- The linked bill's row for the item's month (a bill whose amount changed
    -- is several rows), so the amount shown is the one that month uses.
    left join lateral (
      select f.id, f.name, f.amount_cents, f.is_estimate
      from fixed_items picked
      join fixed_items f
        on f.user_id = picked.user_id
       and coalesce(f.series_id, f.id) = coalesce(picked.series_id, picked.id)
       and f.start_month <= to_char(p.spent_on, 'YYYY-MM')
       and (f.end_month is null or f.end_month >= to_char(p.spent_on, 'YYYY-MM'))
      where picked.id = p.fixed_item_id and picked.user_id = p.user_id
      order by f.start_month desc
      limit 1
    ) bill on true
    left join accounts acct on acct.id = p.account_id and acct.user_id = p.user_id
    where p.user_id = ${userId}
    order by p.created_at asc, p.id asc
  `;
  return rows.map(toPending);
}

export async function countPendingExpenses(userId: string): Promise<number> {
  const [row] = await db()`
    select count(*)::int as n from pending_expenses where user_id = ${userId}
  `;
  return Number(row?.n ?? 0);
}

/**
 * A saved expense, or an item already waiting for review, on `spentOn` with
 * the same total. A receipt split across categories counts as one expense, with
 * its parts added together. Emails about one purchase (the order, the shipping
 * notice, the receipt) describe it differently, so the description isn't
 * compared: the same amount on the same day is enough to ask.
 */
export async function selectDuplicateMatch(
  userId: string,
  spentOn: string,
  amountCents: number,
): Promise<DuplicateMatch | null> {
  const rows = await db()`
    select * from (
      select 'expense' as kind, min(e.id::text) as id,
             min(e.description) as description, max(e.created_at) as created_at
      from expenses e
      where e.user_id = ${userId} and e.spent_on = ${spentOn}
      group by coalesce(e.receipt_id, e.id)
      having sum(e.amount_cents) = ${amountCents}
      union all
      select 'pending', p.id::text, p.description, p.created_at
      from pending_expenses p
      where p.user_id = ${userId} and p.spent_on = ${spentOn}
        and p.amount_cents = ${amountCents}
    ) matches
    order by kind = 'expense' desc, created_at desc
    limit 1
  `;
  const [row] = rows;
  if (!row) return null;
  return {
    kind: row.kind === "pending" ? "pending" : "expense",
    id: String(row.id),
    description: row.description,
    spentOn,
    amountCents,
  };
}

/** Returns false when no row matched (missing, or not this user's). */
export async function updatePendingExpense(
  userId: string,
  id: string,
  values: Pick<
    PendingValues,
    "spentOn" | "description" | "category" | "amountCents" | "accountId"
  >,
): Promise<boolean> {
  // Leaving accountId out keeps the account the item has.
  const rows = await db()`
    update pending_expenses
    set spent_on = ${values.spentOn}, description = ${values.description},
        category = ${values.category}, amount_cents = ${values.amountCents},
        account_id = case when ${values.accountId !== undefined}::boolean
                          then ${values.accountId ?? null}::uuid
                          else account_id end
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/**
 * Turns the item into a normal expense and removes it from review, in one
 * statement, so approving twice can never save it twice. An attached receipt
 * becomes a receipts row linked to the expense, and "not paid yet" carries
 * over.
 *
 * An item that pays a fixed bill becomes that bill's payment for its month:
 * the expense is linked to the bill (so it isn't counted twice) and the month
 * is marked paid. A subscription with no bill becomes a new fixed bill from
 * its month, with the expense as its first payment. Returns null when no row
 * matched (missing, already handled, or not this user's).
 *
 * `accountId` is the account the expense comes out of, as the caller worked
 * it out (null: the primary chequing account).
 */
export async function approvePendingExpense(
  userId: string,
  id: string,
  accountId: string | null,
): Promise<{ expenseId: string; fixedItemId: string | null } | null> {
  const rows = await db()`
    with taken as (
      delete from pending_expenses
      where id = ${id} and user_id = ${userId}
      returning user_id, spent_on, to_char(spent_on, 'YYYY-MM') as month,
                description, merchant, category, amount_cents, unpaid, paid_at,
                paid_on, receipt, fixed_item_id, is_subscription
    ),
    bill as (
      select f.id
      from taken t
      join fixed_items picked
        on picked.id = t.fixed_item_id and picked.user_id = t.user_id
      join fixed_items f
        on f.user_id = t.user_id
       and coalesce(f.series_id, f.id) = coalesce(picked.series_id, picked.id)
       and f.start_month <= t.month
       and (f.end_month is null or f.end_month >= t.month)
      order by f.start_month desc
      limit 1
    ),
    new_bill as (
      insert into fixed_items (user_id, name, category, amount_cents, due_day,
                               start_month, merchant, match_keywords)
      select user_id, coalesce(merchant, description), category, amount_cents,
             extract(day from spent_on)::int, month, merchant,
             case when merchant is null then '{}'::text[]
                  else array[merchant] end
      from taken
      where is_subscription is true and not exists (select 1 from bill)
      returning id
    ),
    saved_receipt as (
      insert into receipts (user_id, merchant, purchased_on, subtotal_cents,
                            tax_cents, total_cents, raw_text, image_pathname,
                            file_pathname, file_kind, file_name, file_bytes,
                            email_subject, email_from, email_date,
                            email_message_id, content_hash, currency)
      select user_id, receipt->>'merchant', (receipt->>'purchased_on')::date,
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
      insert into expenses (user_id, month, spent_on, description, category,
                            amount_cents, unpaid, paid_at, paid_on, receipt_id,
                            fixed_item_id, account_id)
      select user_id, month, spent_on, description, category, amount_cents,
             unpaid, paid_at, paid_on, (select id from saved_receipt limit 1),
             coalesce((select id from bill), (select id from new_bill)),
             ${accountId}::uuid
      from taken
      returning id, user_id, month, spent_on, unpaid, paid_on, amount_cents,
                fixed_item_id
    ),
    paid as (
      insert into fixed_item_payments (user_id, fixed_item_id, month, paid_on,
                                       amount_cents, expense_id)
      select user_id, fixed_item_id, month,
             case when unpaid then null else coalesce(paid_on, spent_on) end,
             amount_cents, id
      from saved
      where fixed_item_id is not null
      on conflict (fixed_item_id, month) do update
      set paid_on = excluded.paid_on, amount_cents = excluded.amount_cents,
          expense_id = excluded.expense_id
      returning fixed_item_id
    )
    select id, fixed_item_id from saved
  `;
  const [row] = rows;
  if (!row) return null;
  return {
    expenseId: String(row.id),
    fixedItemId: row.fixed_item_id == null ? null : String(row.fixed_item_id),
  };
}

/**
 * Links an item waiting for review to the fixed bill it pays (or unlinks it
 * with null), and records whether it's a subscription. False when no row
 * matched.
 */
export async function setPendingBill(
  userId: string,
  id: string,
  values: { fixedItemId?: string | null; isSubscription?: boolean | null },
): Promise<boolean> {
  const billGiven = values.fixedItemId !== undefined;
  const subscriptionGiven = values.isSubscription !== undefined;
  const rows = await db()`
    update pending_expenses
    set fixed_item_id = case when ${billGiven} then ${values.fixedItemId ?? null}::uuid
                             else fixed_item_id end,
        is_subscription = case when ${subscriptionGiven}
                               then ${values.isSubscription ?? null}::boolean
                               else is_subscription end
    where id = ${id} and user_id = ${userId}
      and (${values.fixedItemId ?? null}::uuid is null
           or exists (select 1 from fixed_items f
                      where f.id = ${values.fixedItemId ?? null}::uuid
                        and f.user_id = ${userId}))
    returning id
  `;
  return rows.length > 0;
}

/** One item waiting for review, or null. */
export async function selectPendingExpense(
  userId: string,
  id: string,
): Promise<PendingExpense | null> {
  return (await selectPendingExpenses(userId)).find((p) => p.id === id) ?? null;
}

/**
 * Attaches (or replaces) the item's receipt. Returns the copies (photo or
 * file) the old receipt had, if a different one replaced them, so the caller
 * can remove them; or false when no row matched.
 */
export async function setPendingReceipt(
  userId: string,
  id: string,
  receipt: ReceiptDetails,
): Promise<ReplacedFiles | false> {
  const rows = await db()`
    with old as (
      select receipt->>'image_pathname' as image,
             receipt->>'file_pathname' as file
      from pending_expenses
      where id = ${id} and user_id = ${userId}
    )
    update pending_expenses set receipt = ${receiptJson(receipt)}::jsonb
    where id = ${id} and user_id = ${userId}
    returning (select image from old) as old_image,
              (select file from old) as old_file
  `;
  const [row] = rows;
  if (!row) return false;
  return {
    replacedFiles: [row.old_image, row.old_file].filter(
      (p): p is string =>
        typeof p === "string" &&
        p !== "" &&
        p !== receipt.imagePathname &&
        p !== receipt.filePathname,
    ),
  };
}

/** Marks an item waiting for review as paid on `paidOn`. False when no row matched. */
export async function markPendingPaid(
  userId: string,
  id: string,
  paidOn: string,
): Promise<boolean> {
  const rows = await db()`
    update pending_expenses
    set unpaid = false, paid_at = now(), paid_on = ${paidOn}
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/** Returns false when no row matched (missing, or not this user's). */
export async function deletePendingExpense(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    delete from pending_expenses where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}
