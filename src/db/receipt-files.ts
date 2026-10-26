import "server-only";
import { db, type Row } from "@/db/client";
import type { DuplicateMatch, ReceiptDetails } from "@/lib/pending-expenses";
import {
  isReceiptFileKind,
  type ReceiptFileKind,
  type ReceiptKind,
  receiptKindOf,
} from "@/lib/receipt-files";

/*
 * Raw SQL for receipt copies (photo, PDF or email) wherever they hang: a
 * saved expense, an item waiting for review, or a fixed bill's payment.
 * Callers (the DAL, the MCP tools) handle auth and rules.
 */

/** What identifies the email or file a receipt was made from. */
export type ReceiptSource = {
  messageId: string | null;
  contentHash: string | null;
};

/** What a receipt says, as comparable strings (null where it says nothing). */
export type ReceiptReading = Record<
  "merchant" | "purchasedOn" | "subtotal" | "tax" | "total" | "text",
  string | null
>;

/** An item's current receipt: where it came from and what it says. */
export type ExistingReceipt = ReceiptSource & { reading: ReceiptReading };

const str = (value: unknown) => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

/** The reading of a receipt about to be saved, in the same shape. */
export const readingOf = (r: ReceiptDetails): ReceiptReading => ({
  merchant: r.merchant,
  purchasedOn: r.purchasedOn,
  subtotal: str(r.subtotalCents),
  tax: str(r.taxCents),
  total: str(r.totalCents),
  text: r.rawText,
});

const sameReading = (a: ReceiptReading, b: ReceiptReading) =>
  (Object.keys(a) as (keyof ReceiptReading)[]).every(
    (key) => (a[key] ?? null) === (b[key] ?? null),
  );

/**
 * Re-sending what an item already has (the same email or file, read the same
 * way) changes nothing. A new reading of the same email replaces it, as any
 * new receipt does: either way an item holds one receipt, never two.
 */
export function isSameReceipt(
  existing: ExistingReceipt,
  incoming: ReceiptSource & { reading: ReceiptReading },
): boolean {
  return (
    sameSource(existing, incoming) &&
    sameReading(existing.reading, incoming.reading)
  );
}

/**
 * Whether two receipts came from the same email or file. A content hash on
 * both sides decides (one email can carry two different PDFs); otherwise the
 * Message-ID does.
 */
export function sameSource(a: ReceiptSource, b: ReceiptSource): boolean {
  if (a.contentHash && b.contentHash) return a.contentHash === b.contentHash;
  return Boolean(a.messageId && b.messageId && a.messageId === b.messageId);
}

const existingOf = (r: Row | undefined): ExistingReceipt | null =>
  r
    ? {
        messageId: r.email_message_id ?? null,
        contentHash: r.content_hash ?? null,
        reading: {
          merchant: str(r.merchant),
          purchasedOn: str(r.purchased_on),
          subtotal: str(r.subtotal_cents),
          tax: str(r.tax_cents),
          total: str(r.total_cents),
          text: str(r.raw_text),
        },
      }
    : null;

/** The receipt on one of the user's expenses, or null without one. */
export async function selectExpenseReceipt(
  userId: string,
  expenseId: string,
): Promise<ExistingReceipt | null> {
  const rows = await db()`
    select r.email_message_id, r.content_hash, r.merchant, r.purchased_on,
           r.subtotal_cents, r.tax_cents, r.total_cents, r.raw_text
    from expenses e
    join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
    where e.id = ${expenseId} and e.user_id = ${userId}
  `;
  return existingOf(rows[0]);
}

/** The receipt on an item waiting for review, or null without one. */
export async function selectPendingReceipt(
  userId: string,
  pendingId: string,
): Promise<ExistingReceipt | null> {
  const rows = await db()`
    select receipt->>'email_message_id' as email_message_id,
           receipt->>'content_hash' as content_hash,
           receipt->>'merchant' as merchant,
           receipt->>'purchased_on' as purchased_on,
           receipt->>'subtotal_cents' as subtotal_cents,
           receipt->>'tax_cents' as tax_cents,
           receipt->>'total_cents' as total_cents,
           receipt->>'raw_text' as raw_text
    from pending_expenses
    where id = ${pendingId} and user_id = ${userId} and receipt is not null
  `;
  return existingOf(rows[0]);
}

/**
 * Another expense or pending item already holding a receipt from this email
 * or file: re-sending the same receipt email with add_expense is a duplicate.
 */
export async function selectReceiptSourceMatch(
  userId: string,
  source: ReceiptSource,
): Promise<DuplicateMatch | null> {
  if (!source.messageId && !source.contentHash) return null;
  const rows = await db()`
    select * from (
      select 'expense' as kind, e.id, e.description, e.spent_on,
             e.amount_cents, e.created_at
      from expenses e
      join receipts r on r.id = e.receipt_id and r.user_id = e.user_id
      where e.user_id = ${userId}
        and case when ${source.contentHash}::text is not null
                      and r.content_hash is not null
                 then r.content_hash = ${source.contentHash}
                 else ${source.messageId}::text is not null
                      and r.email_message_id = ${source.messageId} end
      union all
      select 'pending' as kind, p.id, p.description, p.spent_on,
             p.amount_cents, p.created_at
      from pending_expenses p
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
  const [r] = rows;
  if (!r) return null;
  return {
    kind: r.kind === "pending" ? "pending" : "expense",
    id: String(r.id),
    description: String(r.description),
    spentOn:
      r.spent_on instanceof Date
        ? r.spent_on.toISOString().slice(0, 10)
        : String(r.spent_on).slice(0, 10),
    amountCents: Number(r.amount_cents),
  };
}

/** A fixed bill's payment for a month: where its receipt goes. */
export type BillPaymentTarget = {
  /** The expense that paid it: the receipt goes on that expense. */
  expenseId: string | null;
  /** The payment's own receipt, when it has no expense. */
  receiptId: string | null;
  existing: ExistingReceipt | null;
};

/** The payment of one of the user's bills in `month`, or null when it isn't marked paid. */
export async function selectBillPaymentTarget(
  userId: string,
  fixedItemId: string,
  month: string,
): Promise<BillPaymentTarget | null> {
  const rows = await db()`
    select p.expense_id, p.receipt_id, r.email_message_id, r.content_hash,
           r.merchant, r.purchased_on, r.subtotal_cents, r.tax_cents,
           r.total_cents, r.raw_text
    from fixed_item_payments p
    join fixed_items f on f.id = p.fixed_item_id and f.user_id = p.user_id
    left join receipts r on r.id = p.receipt_id and r.user_id = p.user_id
    where p.fixed_item_id = ${fixedItemId} and p.month = ${month}
      and p.user_id = ${userId}
  `;
  const [r] = rows;
  if (!r) return null;
  return {
    expenseId: r.expense_id ?? null,
    receiptId: r.receipt_id ?? null,
    existing: r.receipt_id ? existingOf(r) : null,
  };
}

/** The old copies a replaced receipt had, so the caller can remove them. */
export type ReplacedFiles = { replacedFiles: string[] };

const replacedFrom = (
  old: Row | undefined,
  receipt: ReceiptDetails,
): string[] =>
  [old?.old_image, old?.old_file]
    .filter((p): p is string => typeof p === "string" && p !== "")
    .filter((p) => p !== receipt.imagePathname && p !== receipt.filePathname);

/**
 * Attaches (or replaces) the receipt on a bill's payment for `month` that has
 * no expense. False when that payment is missing or someone else's.
 */
export async function setBillPaymentReceipt(
  userId: string,
  fixedItemId: string,
  month: string,
  receipt: ReceiptDetails,
): Promise<ReplacedFiles | false> {
  const values = receiptValues(receipt);
  const rows = await db()`
    with target as (
      select p.fixed_item_id, p.receipt_id from fixed_item_payments p
      where p.fixed_item_id = ${fixedItemId} and p.month = ${month}
        and p.user_id = ${userId}
    ),
    old as (
      select r.image_pathname, r.file_pathname from receipts r, target
      where r.id = target.receipt_id and r.user_id = ${userId}
    ),
    updated as (
      update receipts r
      set merchant = ${values.merchant}, purchased_on = ${values.purchasedOn},
          subtotal_cents = ${values.subtotalCents}, tax_cents = ${values.taxCents},
          total_cents = ${values.totalCents}, raw_text = ${values.rawText},
          image_pathname = ${values.imagePathname},
          file_pathname = ${values.filePathname}, file_kind = ${values.fileKind},
          file_name = ${values.fileName}, file_bytes = ${values.fileBytes},
          email_subject = ${values.emailSubject}, email_from = ${values.emailFrom},
          email_date = ${values.emailDate},
          email_message_id = ${values.emailMessageId},
          content_hash = ${values.contentHash}
      from target
      where r.id = target.receipt_id and r.user_id = ${userId}
      returning r.id
    ),
    inserted as (
      insert into receipts (user_id, merchant, purchased_on, subtotal_cents,
                            tax_cents, total_cents, raw_text, image_pathname,
                            file_pathname, file_kind, file_name, file_bytes,
                            email_subject, email_from, email_date,
                            email_message_id, content_hash)
      select ${userId}, ${values.merchant}, ${values.purchasedOn},
             ${values.subtotalCents}, ${values.taxCents}, ${values.totalCents},
             ${values.rawText}, ${values.imagePathname}, ${values.filePathname},
             ${values.fileKind}, ${values.fileName}, ${values.fileBytes},
             ${values.emailSubject}, ${values.emailFrom}, ${values.emailDate},
             ${values.emailMessageId}, ${values.contentHash}
      from target
      where target.receipt_id is null
      returning id
    ),
    linked as (
      update fixed_item_payments p set receipt_id = inserted.id
      from inserted
      where p.fixed_item_id = ${fixedItemId} and p.month = ${month}
        and p.user_id = ${userId}
      returning p.fixed_item_id
    )
    select (select count(*) from target)::int as found,
           (select image_pathname from old limit 1) as old_image,
           (select file_pathname from old limit 1) as old_file,
           (select count(*) from updated)::int + (select count(*) from linked)::int as changed
  `;
  const [row] = rows;
  if (!row || Number(row.found) === 0) return false;
  return { replacedFiles: replacedFrom(row, receipt) };
}

/** Every receipt column, null where the receipt doesn't say. */
export function receiptValues(r: ReceiptDetails) {
  return {
    merchant: r.merchant,
    purchasedOn: r.purchasedOn,
    subtotalCents: r.subtotalCents,
    taxCents: r.taxCents,
    totalCents: r.totalCents,
    rawText: r.rawText,
    imagePathname: r.imagePathname,
    filePathname: r.filePathname ?? null,
    fileKind: r.fileKind ?? null,
    fileName: r.fileName ?? null,
    fileBytes: r.fileBytes ?? null,
    emailSubject: r.emailSubject ?? null,
    emailFrom: r.emailFrom ?? null,
    emailDate: r.emailDate ?? null,
    emailMessageId: r.emailMessageId ?? null,
    contentHash: r.contentHash ?? null,
  };
}

/** A receipt's copy to serve: where it is and what to call it. */
export type StoredReceiptFile = {
  kind: Exclude<ReceiptKind, "details">;
  pathname: string;
  /** The attachment's name, or the email's subject. */
  name: string | null;
};

function toStoredFile(r: Row | undefined): StoredReceiptFile | null {
  if (!r) return null;
  if (isReceiptFileKind(r.file_kind) && r.file_pathname) {
    const kind: ReceiptFileKind = r.file_kind;
    return {
      kind,
      pathname: String(r.file_pathname),
      name: (kind === "pdf" ? r.file_name : r.email_subject) ?? null,
    };
  }
  if (r.image_pathname) {
    return {
      kind: "photo",
      pathname: String(r.image_pathname),
      name: r.merchant ?? null,
    };
  }
  return null;
}

/** The copy saved with one of this user's receipts, or null. */
export async function selectReceiptFile(
  userId: string,
  receiptId: string,
): Promise<StoredReceiptFile | null> {
  const rows = await db()`
    select image_pathname, file_pathname, file_kind, file_name, email_subject,
           merchant
    from receipts
    where id = ${receiptId} and user_id = ${userId}
  `;
  return toStoredFile(rows[0]);
}

/**
 * The copy attached to one of this user's items waiting for review (an
 * expense or income), or null.
 */
export async function selectPendingReceiptFile(
  userId: string,
  pendingId: string,
): Promise<StoredReceiptFile | null> {
  const rows = await db()`
    select receipt->>'image_pathname' as image_pathname,
           receipt->>'file_pathname' as file_pathname,
           receipt->>'file_kind' as file_kind,
           receipt->>'file_name' as file_name,
           receipt->>'email_subject' as email_subject,
           coalesce(receipt->>'merchant', merchant) as merchant
    from pending_expenses
    where id = ${pendingId} and user_id = ${userId} and receipt is not null
    union all
    select receipt->>'image_pathname', receipt->>'file_pathname',
           receipt->>'file_kind', receipt->>'file_name',
           receipt->>'email_subject', coalesce(receipt->>'merchant', payer)
    from pending_income
    where id = ${pendingId} and user_id = ${userId} and receipt is not null
  `;
  return toStoredFile(rows[0]);
}

/** A bill payment's receipt, for the Fixed bills page. */
export type BillReceipt = { receiptId: string; kind: ReceiptKind };

/**
 * The receipts on this user's bill payments in `month`, by bill id: the
 * payment's own receipt, else the receipt of the expense that paid it.
 */
export async function selectBillReceipts(
  userId: string,
  month: string,
): Promise<Map<string, BillReceipt>> {
  const rows = await db()`
    select p.fixed_item_id, r.id as receipt_id, r.file_kind, r.image_pathname
    from fixed_item_payments p
    left join expenses e on e.id = p.expense_id and e.user_id = p.user_id
    join receipts r
      on r.id = coalesce(p.receipt_id, e.receipt_id) and r.user_id = p.user_id
    where p.user_id = ${userId} and p.month = ${month}
  `;
  return new Map(
    rows.map((r) => [
      String(r.fixed_item_id),
      {
        receiptId: String(r.receipt_id),
        kind: receiptKindOf({
          fileKind: r.file_kind,
          imagePathname: r.image_pathname,
        }),
      },
    ]),
  );
}
