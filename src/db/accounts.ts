import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { userDataTag } from "@/db/cache-tags";
import { db, type Row } from "@/db/client";
import {
  type Account,
  type AccountStatement,
  type AccountTransfer,
  type AccountType,
  isDebtType,
  type PendingAccount,
} from "@/lib/accounts";
import { TIME_ZONE } from "@/lib/month";

/** Raw SQL for accounts, statements, transfers and proposed accounts. Callers handle auth. */

const toIso = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

const toDate = (value: unknown): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const centsOrNull = (value: unknown) => (value == null ? null : Number(value));

/**
 * When a balance was true. `now` for a balance entered or alerted right now,
 * `instant` for a known moment, `dayAfter` for a statement: everything dated
 * on its closing date is already in it, so only what's dated later comes off.
 */
export type BalanceAsOf =
  | { kind: "now" }
  | { kind: "instant"; at: string }
  | { kind: "dayAfter"; date: string };

const asOfParams = (asOf: BalanceAsOf) => ({
  kind: asOf.kind,
  at: asOf.kind === "instant" ? asOf.at : null,
  date: asOf.kind === "dayAfter" ? asOf.date : null,
});

function toAccount(r: Row): Account {
  const type = r.type as AccountType;
  const enteredCents = Number(r.balance_cents);
  const spentSinceCents = Number(r.spent_since_cents ?? 0);
  const inCents = Number(r.transfers_in_cents ?? 0);
  const outCents = Number(r.transfers_out_cents ?? 0);
  // Money in raises a chequing balance but pays down what's owed on credit.
  const transfersSinceCents = isDebtType(type)
    ? outCents - inCents
    : inCents - outCents;
  // Deposits only go into chequing or savings, so they only ever raise it.
  const depositsSinceCents = isDebtType(type)
    ? 0
    : Number(r.deposits_cents ?? 0);
  return {
    id: r.id,
    type,
    name: r.name,
    institution: r.institution ?? null,
    lastFour: r.last_four ?? null,
    isPrimary: Boolean(r.is_primary),
    // Spending takes money out of chequing but adds to what's owed on credit.
    balanceCents:
      enteredCents +
      (isDebtType(type) ? spentSinceCents : -spentSinceCents) +
      transfersSinceCents +
      depositsSinceCents,
    enteredCents,
    spentSinceCents,
    transfersSinceCents,
    depositsSinceCents,
    balanceAsOf: toIso(r.balance_as_of),
    balanceSource: r.balance_source ?? null,
    creditLimitCents: centsOrNull(r.credit_limit_cents),
    availableCreditCents: centsOrNull(r.available_credit_cents),
    statementBalanceCents: centsOrNull(r.statement_balance_cents),
    statementClosingDate: toDate(r.statement_closing_date),
    paymentDueDate: toDate(r.payment_due_date),
    minimumPaymentCents: centsOrNull(r.minimum_payment_cents),
    createdAt: toIso(r.created_at),
  };
}

/**
 * The user's accounts with their balances now, or just `id`.
 *
 * The balance is worked out on read, like the old bank balance: what was
 * entered or reported, then
 * - for every account, the expenses paid from it that came after it (added
 *   after `balance_as_of` and dated on or after its day, in the app's time
 *   zone; an unpaid expense waits until it's paid): less for chequing, more
 *   owed for a credit card or line of credit. An expense with no account_id
 *   (every one saved before accounts) was paid from the primary chequing
 *   account, which also loses paid bills by the same rule, and
 * - for every account, plus or minus transfers that came after it by the same
 *   rule. Transfers are never expenses, so they're never counted as spending.
 * - for every account, plus take-home entries deposited into it (income with
 *   its account_id, such as an e-Transfer an AI found and the user approved)
 *   that came after it by the same rule.
 * Editing or deleting an expense or transfer can never leave it wrong, and a
 * new balance starts fresh.
 */
export async function selectAccounts(
  userId: string,
  id: string | null = null,
): Promise<Account[]> {
  "use cache";
  cacheTag(userDataTag(userId));
  cacheLife("minutes");
  const rows = await db()`
    select a.id, a.type, a.name, a.institution, a.last_four, a.is_primary,
           a.balance_cents, a.balance_as_of, a.balance_source,
           a.credit_limit_cents, a.available_credit_cents,
           a.statement_balance_cents,
           to_char(a.statement_closing_date, 'YYYY-MM-DD') as statement_closing_date,
           to_char(a.payment_due_date, 'YYYY-MM-DD') as payment_due_date,
           a.minimum_payment_cents, a.created_at,
           coalesce((
             select sum(e.amount_cents) from expenses e
             where e.user_id = a.user_id
               -- Paid from this account, or (no account given) from the
               -- primary chequing account, as every expense was before accounts.
               and (e.account_id = a.id or (e.account_id is null and a.is_primary))
               and not e.unpaid
               and coalesce(e.paid_at, e.created_at) > a.balance_as_of
               and coalesce(e.paid_on, e.spent_on)
                   >= (a.balance_as_of at time zone ${TIME_ZONE}::text)::date
           ), 0)
           + case when a.is_primary then
             coalesce((
               select sum(p.amount_cents) from fixed_item_payments p
               where p.user_id = a.user_id
                 and p.expense_id is null
                 and p.paid_on is not null
                 and p.amount_cents is not null
                 and p.created_at > a.balance_as_of
                 and p.paid_on >= (a.balance_as_of at time zone ${TIME_ZONE}::text)::date
             ), 0)
           else 0 end as spent_since_cents,
           coalesce((
             select sum(t.amount_cents) from account_transfers t
             where t.user_id = a.user_id and t.to_account_id = a.id
               and t.created_at > a.balance_as_of
               and t.transferred_on >= (a.balance_as_of at time zone ${TIME_ZONE}::text)::date
           ), 0) as transfers_in_cents,
           coalesce((
             select sum(t.amount_cents) from account_transfers t
             where t.user_id = a.user_id and t.from_account_id = a.id
               and t.created_at > a.balance_as_of
               and t.transferred_on >= (a.balance_as_of at time zone ${TIME_ZONE}::text)::date
           ), 0) as transfers_out_cents,
           coalesce((
             select sum(i.amount_cents) from income i
             where i.user_id = a.user_id and i.account_id = a.id
               and i.received_on is not null
               and i.created_at > a.balance_as_of
               and i.received_on >= (a.balance_as_of at time zone ${TIME_ZONE}::text)::date
           ), 0) as deposits_cents
    from accounts a
    where a.user_id = ${userId}
      and (${id}::uuid is null or a.id = ${id}::uuid)
    order by a.is_primary desc,
             case a.type when 'chequing' then 0 when 'savings' then 1
                         when 'credit_card' then 2 else 3 end,
             a.created_at, a.id
  `;
  return rows.map(toAccount);
}

export async function selectAccount(
  userId: string,
  id: string,
): Promise<Account | null> {
  return (await selectAccounts(userId, id))[0] ?? null;
}

export type AccountValues = {
  type: AccountType;
  name: string;
  institution: string | null;
  lastFour: string | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  statementBalanceCents: number | null;
  paymentDueDate: string | null;
  minimumPaymentCents: number | null;
};

/**
 * Adds an account with its balance as of now. The first chequing account
 * becomes the primary one; `isPrimary` makes this one primary instead.
 */
export async function insertAccount(
  userId: string,
  values: AccountValues & {
    balanceCents: number;
    balanceSource: string;
    isPrimary?: boolean;
  },
): Promise<string> {
  const makePrimary = values.type === "chequing" && values.isPrimary === true;
  if (!makePrimary) {
    const [row] = await db()`
      insert into accounts (user_id, type, name, institution, last_four,
                            balance_cents, balance_as_of, balance_source,
                            credit_limit_cents, available_credit_cents,
                            statement_balance_cents, payment_due_date,
                            minimum_payment_cents, is_primary)
      values (${userId}, ${values.type}, ${values.name}, ${values.institution},
              ${values.lastFour}, ${values.balanceCents}, now(),
              ${values.balanceSource}, ${values.creditLimitCents},
              ${values.availableCreditCents}, ${values.statementBalanceCents},
              ${values.paymentDueDate}::date, ${values.minimumPaymentCents},
              ${values.type} = 'chequing' and not exists (
                select 1 from accounts p where p.user_id = ${userId} and p.is_primary
              ))
      returning id
    `;
    return String(row?.id);
  }
  const [, inserted] = await db().transaction((sql) => [
    sql`update accounts set is_primary = false where user_id = ${userId} and is_primary`,
    sql`
      insert into accounts (user_id, type, name, institution, last_four,
                            balance_cents, balance_as_of, balance_source,
                            credit_limit_cents, available_credit_cents,
                            statement_balance_cents, payment_due_date,
                            minimum_payment_cents, is_primary)
      values (${userId}, ${values.type}, ${values.name}, ${values.institution},
              ${values.lastFour}, ${values.balanceCents}, now(),
              ${values.balanceSource}, ${values.creditLimitCents},
              ${values.availableCreditCents}, ${values.statementBalanceCents},
              ${values.paymentDueDate}::date, ${values.minimumPaymentCents}, true)
      returning id
    `,
  ]);
  return String((inserted as Row[])[0]?.id);
}

/**
 * Changes an account's details. A new `balanceCents` is entered as of now;
 * leave it out to keep the balance (and its date) as it was. Returns false
 * when the account isn't the user's.
 */
export async function updateAccountRow(
  userId: string,
  id: string,
  values: AccountValues & {
    balanceCents?: number;
    isPrimary?: boolean;
  },
): Promise<boolean> {
  const setBalance = values.balanceCents !== undefined;
  const makePrimary = values.type === "chequing" && values.isPrimary === true;
  const [, updated] = await db().transaction((sql) => [
    makePrimary
      ? sql`update accounts set is_primary = false
            where user_id = ${userId} and is_primary and id <> ${id}
              and exists (select 1 from accounts mine
                          where mine.id = ${id} and mine.user_id = ${userId})`
      : sql`select 1`,
    sql`
      update accounts set
        type = ${values.type},
        name = ${values.name},
        institution = ${values.institution},
        last_four = ${values.lastFour},
        credit_limit_cents = ${values.creditLimitCents},
        available_credit_cents = ${values.availableCreditCents},
        statement_balance_cents = ${values.statementBalanceCents},
        payment_due_date = ${values.paymentDueDate}::date,
        minimum_payment_cents = ${values.minimumPaymentCents},
        balance_cents = case when ${setBalance} then ${values.balanceCents ?? 0}::bigint
                             else balance_cents end,
        balance_as_of = case when ${setBalance} then now() else balance_as_of end,
        balance_source = case when ${setBalance} then 'manual' else balance_source end,
        is_primary = case when ${values.type} <> 'chequing' then false
                          when ${makePrimary} then true
                          else is_primary end,
        updated_at = now()
      where id = ${id} and user_id = ${userId}
      returning id
    `,
  ]);
  const ok = (updated as Row[]).length > 0;
  if (ok) await promotePrimary(userId);
  return ok;
}

/**
 * Makes the oldest chequing account primary when none is, e.g. after the
 * primary one was deleted or became a credit card.
 */
export async function promotePrimary(userId: string) {
  await db()`
    update accounts set is_primary = true
    where id = (
      select id from accounts
      where user_id = ${userId} and type = 'chequing'
      order by created_at, id limit 1
    )
    and not exists (
      select 1 from accounts where user_id = ${userId} and is_primary
    )
  `;
}

/**
 * Deletes an account with its statements. Returns the statement PDFs to
 * remove from the store, or null when the account isn't the user's.
 * Transfers keep their other side.
 */
export async function deleteAccountRow(
  userId: string,
  id: string,
): Promise<{ pdfPathnames: string[] } | null> {
  const [row] = await db()`
    with pdfs as (
      select pdf_pathname from account_statements
      where account_id = ${id} and user_id = ${userId} and pdf_pathname is not null
    ),
    gone as (
      delete from accounts where id = ${id} and user_id = ${userId} returning id
    )
    select (select count(*) from gone)::int as deleted,
           array(select pdf_pathname from pdfs) as pdfs
  `;
  if (!row || Number(row.deleted) === 0) return null;
  await promotePrimary(userId);
  return { pdfPathnames: (row.pdfs ?? []) as string[] };
}

export type BalanceUpdate = "updated" | "older" | "missing";

/**
 * Sets an account's balance as of `asOf`, unless the account already has a
 * newer one: a statement or an old alert never replaces a balance the user
 * (or a later alert) gave since.
 */
export async function setAccountBalanceIfNewer(
  userId: string,
  id: string,
  balanceCents: number,
  asOf: BalanceAsOf,
  source: string,
): Promise<BalanceUpdate> {
  const p = asOfParams(asOf);
  const rows = await db()`
    with t as (
      select case ${p.kind}::text
               when 'instant' then ${p.at}::timestamptz
               when 'dayAfter' then ((${p.date}::date + 1)::timestamp at time zone ${TIME_ZONE}::text)
               else now()
             end as as_of
    ),
    updated as (
      update accounts a set balance_cents = ${balanceCents},
                            balance_as_of = t.as_of,
                            balance_source = ${source},
                            updated_at = now()
      from t
      where a.id = ${id} and a.user_id = ${userId} and t.as_of >= a.balance_as_of
      returning a.id
    )
    select (select count(*) from updated)::int as updated,
           exists (select 1 from accounts where id = ${id} and user_id = ${userId}) as found
  `;
  const row = rows[0];
  if (!row?.found) return "missing";
  return Number(row.updated) > 0 ? "updated" : "older";
}

/* ---------- Statements ---------- */

const toStatement = (r: Row): AccountStatement => ({
  id: r.id,
  accountId: r.account_id,
  closingDate: toDate(r.closing_date) ?? "",
  balanceCents: Number(r.balance_cents),
  minimumPaymentCents: centsOrNull(r.minimum_payment_cents),
  paymentDueDate: toDate(r.payment_due_date),
  hasPdf: Boolean(r.has_pdf),
  source: r.source ?? null,
  createdAt: toIso(r.created_at),
});

const STATEMENT_COLUMNS = `id, account_id, to_char(closing_date, 'YYYY-MM-DD') as closing_date,
  balance_cents, minimum_payment_cents,
  to_char(payment_due_date, 'YYYY-MM-DD') as payment_due_date,
  (pdf_pathname is not null) as has_pdf, source, created_at`;

/** The user's statements, newest closing date first. */
export async function selectStatements(
  userId: string,
): Promise<AccountStatement[]> {
  const rows = await db().query(
    `select ${STATEMENT_COLUMNS} from account_statements
     where user_id = $1 order by closing_date desc, created_at desc`,
    [userId],
  );
  return rows.map(toStatement);
}

export async function selectStatementFor(
  userId: string,
  accountId: string,
  closingDate: string,
): Promise<AccountStatement | null> {
  const rows = await db().query(
    `select ${STATEMENT_COLUMNS} from account_statements
     where user_id = $1 and account_id = $2 and closing_date = $3::date`,
    [userId, accountId, closingDate],
  );
  return rows[0] ? toStatement(rows[0]) : null;
}

/** The statement's PDF pathname, only when the statement is the user's. */
export async function selectStatementPdf(
  userId: string,
  id: string,
): Promise<string | null> {
  const [row] = await db()`
    select pdf_pathname from account_statements
    where id = ${id} and user_id = ${userId}
  `;
  return row?.pdf_pathname ?? null;
}

export type StatementValues = {
  accountId: string;
  closingDate: string;
  balanceCents: number;
  minimumPaymentCents: number | null;
  paymentDueDate: string | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  pdfPathname: string | null;
  source: string | null;
  client: string | null;
};

/**
 * Records a statement. Returns its id, or null when the account already has
 * one for that closing date (the same statement again changes nothing).
 */
export async function insertStatement(
  userId: string,
  values: StatementValues,
): Promise<string | null> {
  const [row] = await db()`
    insert into account_statements (user_id, account_id, closing_date,
                                    balance_cents, minimum_payment_cents,
                                    payment_due_date, credit_limit_cents,
                                    available_credit_cents, pdf_pathname,
                                    source, client)
    select ${userId}, a.id, ${values.closingDate}::date, ${values.balanceCents},
           ${values.minimumPaymentCents}, ${values.paymentDueDate}::date,
           ${values.creditLimitCents}, ${values.availableCreditCents},
           ${values.pdfPathname}, ${values.source}, ${values.client}
    from accounts a where a.id = ${values.accountId} and a.user_id = ${userId}
    on conflict (account_id, closing_date) do nothing
    returning id
  `;
  return row ? String(row.id) : null;
}

/** Attaches a PDF to a statement that has none. False when it already had one. */
export async function setStatementPdf(
  userId: string,
  id: string,
  pathname: string,
): Promise<boolean> {
  const rows = await db()`
    update account_statements set pdf_pathname = ${pathname}
    where id = ${id} and user_id = ${userId} and pdf_pathname is null
    returning id
  `;
  return rows.length > 0;
}

/**
 * Copies a statement's details (statement balance, due date, minimum
 * payment, limit, available credit) onto the account, unless the account
 * already shows a later statement.
 */
export async function applyStatementDetails(
  userId: string,
  values: StatementValues,
): Promise<boolean> {
  const rows = await db()`
    update accounts set
      statement_balance_cents = ${values.balanceCents},
      statement_closing_date = ${values.closingDate}::date,
      payment_due_date = coalesce(${values.paymentDueDate}::date, payment_due_date),
      minimum_payment_cents = coalesce(${values.minimumPaymentCents}::bigint, minimum_payment_cents),
      credit_limit_cents = coalesce(${values.creditLimitCents}::bigint, credit_limit_cents),
      available_credit_cents = coalesce(${values.availableCreditCents}::bigint, available_credit_cents),
      updated_at = now()
    where id = ${values.accountId} and user_id = ${userId}
      and (statement_closing_date is null
           or statement_closing_date <= ${values.closingDate}::date)
    returning id
  `;
  return rows.length > 0;
}

/* ---------- Transfers ---------- */

const toTransfer = (r: Row): AccountTransfer => ({
  id: r.id,
  fromAccountId: r.from_account_id ?? null,
  toAccountId: r.to_account_id ?? null,
  fromName: r.from_name ?? null,
  toName: r.to_name ?? null,
  amountCents: Number(r.amount_cents),
  transferredOn: toDate(r.transferred_on) ?? "",
  description: r.description ?? null,
  source: r.source ?? null,
  createdAt: toIso(r.created_at),
});

/** The user's transfers, newest first. */
export async function selectTransfers(
  userId: string,
  limit = 50,
): Promise<AccountTransfer[]> {
  const rows = await db()`
    select t.id, t.from_account_id, t.to_account_id, f.name as from_name,
           d.name as to_name, t.amount_cents,
           to_char(t.transferred_on, 'YYYY-MM-DD') as transferred_on,
           t.description, t.source, t.created_at
    from account_transfers t
    left join accounts f on f.id = t.from_account_id
    left join accounts d on d.id = t.to_account_id
    where t.user_id = ${userId}
    order by t.transferred_on desc, t.created_at desc
    limit ${limit}
  `;
  return rows.map(toTransfer);
}

export type TransferValues = {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  transferredOn: string;
  description: string | null;
  source: string | null;
  client: string | null;
};

/** A transfer already recorded with the same accounts, amount and day. */
export async function selectDuplicateTransfer(
  userId: string,
  values: Pick<
    TransferValues,
    "fromAccountId" | "toAccountId" | "amountCents" | "transferredOn"
  >,
): Promise<AccountTransfer | null> {
  const rows = await db()`
    select t.id, t.from_account_id, t.to_account_id, null as from_name,
           null as to_name, t.amount_cents,
           to_char(t.transferred_on, 'YYYY-MM-DD') as transferred_on,
           t.description, t.source, t.created_at
    from account_transfers t
    where t.user_id = ${userId}
      and t.from_account_id = ${values.fromAccountId}
      and t.to_account_id = ${values.toAccountId}
      and t.amount_cents = ${values.amountCents}
      and t.transferred_on = ${values.transferredOn}::date
    limit 1
  `;
  return rows[0] ? toTransfer(rows[0]) : null;
}

/** Records a transfer between two of the user's accounts. Null when either isn't theirs. */
export async function insertTransfer(
  userId: string,
  values: TransferValues,
): Promise<string | null> {
  const [row] = await db()`
    insert into account_transfers (user_id, from_account_id, to_account_id,
                                   amount_cents, transferred_on, description,
                                   source, client)
    select ${userId}, f.id, d.id, ${values.amountCents},
           ${values.transferredOn}::date, ${values.description},
           ${values.source}, ${values.client}
    from accounts f, accounts d
    where f.id = ${values.fromAccountId} and f.user_id = ${userId}
      and d.id = ${values.toAccountId} and d.user_id = ${userId}
      and f.id <> d.id
    returning id
  `;
  return row ? String(row.id) : null;
}

export async function deleteTransferRow(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    delete from account_transfers where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/* ---------- Proposed accounts (Review page) ---------- */

const toPendingAccount = (r: Row): PendingAccount => ({
  id: r.id,
  type: r.type as AccountType,
  name: r.name,
  institution: r.institution ?? null,
  lastFour: r.last_four ?? null,
  balanceCents: centsOrNull(r.balance_cents),
  balanceAsOf: r.balance_as_of == null ? null : toIso(r.balance_as_of),
  creditLimitCents: centsOrNull(r.credit_limit_cents),
  availableCreditCents: centsOrNull(r.available_credit_cents),
  statementClosingDate: toDate(r.statement_closing_date),
  statementBalanceCents: centsOrNull(r.statement_balance_cents),
  paymentDueDate: toDate(r.payment_due_date),
  minimumPaymentCents: centsOrNull(r.minimum_payment_cents),
  hasStatementPdf: Boolean(r.has_pdf),
  source: r.source ?? null,
  client: r.client ?? null,
  createdAt: toIso(r.created_at),
});

export async function selectPendingAccounts(
  userId: string,
): Promise<PendingAccount[]> {
  const rows = await db()`
    select id, type, name, institution, last_four, balance_cents,
           balance_as_of, credit_limit_cents, available_credit_cents,
           to_char(statement_closing_date, 'YYYY-MM-DD') as statement_closing_date,
           statement_balance_cents,
           to_char(payment_due_date, 'YYYY-MM-DD') as payment_due_date,
           minimum_payment_cents,
           (statement_pdf_pathname is not null) as has_pdf,
           source, client, created_at
    from pending_accounts
    where user_id = ${userId}
    order by created_at, id
  `;
  return rows.map(toPendingAccount);
}

export type PendingAccountValues = AccountValues & {
  balanceCents: number | null;
  /** When the balance was true; null with no balance. */
  balanceAsOf: BalanceAsOf | null;
  balanceSource: string | null;
  statementClosingDate: string | null;
  statementPdfPathname: string | null;
  source: string | null;
  client: string | null;
};

export async function insertPendingAccount(
  userId: string,
  values: PendingAccountValues,
): Promise<string> {
  const p = values.balanceAsOf ? asOfParams(values.balanceAsOf) : null;
  const [row] = await db()`
    insert into pending_accounts (user_id, type, name, institution, last_four,
                                  balance_cents, balance_as_of, balance_source,
                                  credit_limit_cents, available_credit_cents,
                                  statement_closing_date, statement_balance_cents,
                                  payment_due_date, minimum_payment_cents,
                                  statement_pdf_pathname, source, client)
    values (${userId}, ${values.type}, ${values.name}, ${values.institution},
            ${values.lastFour}, ${values.balanceCents},
            case ${p?.kind ?? null}::text
              when 'instant' then ${p?.at ?? null}::timestamptz
              when 'dayAfter' then ((${p?.date ?? null}::date + 1)::timestamp at time zone ${TIME_ZONE}::text)
              when 'now' then now()
              else null
            end,
            ${values.balanceSource}, ${values.creditLimitCents},
            ${values.availableCreditCents}, ${values.statementClosingDate}::date,
            ${values.statementBalanceCents}, ${values.paymentDueDate}::date,
            ${values.minimumPaymentCents}, ${values.statementPdfPathname},
            ${values.source}, ${values.client})
    returning id
  `;
  return String(row?.id);
}

/**
 * Creates the account from a proposal and removes the proposal, in one
 * statement. A statement that came with it is recorded against the new
 * account. Returns the new account's id, or null when the proposal is gone.
 */
export async function approvePendingAccountRow(
  userId: string,
  id: string,
): Promise<string | null> {
  const [row] = await db()`
    with taken as (
      delete from pending_accounts
      where id = ${id} and user_id = ${userId}
      returning *
    ),
    made as (
      insert into accounts (user_id, type, name, institution, last_four,
                            balance_cents, balance_as_of, balance_source,
                            credit_limit_cents, available_credit_cents,
                            statement_balance_cents, statement_closing_date,
                            payment_due_date, minimum_payment_cents, is_primary)
      select t.user_id, t.type, t.name, t.institution, t.last_four,
             coalesce(t.balance_cents, 0), coalesce(t.balance_as_of, now()),
             coalesce(t.balance_source, 'ai'),
             t.credit_limit_cents, t.available_credit_cents,
             t.statement_balance_cents, t.statement_closing_date,
             t.payment_due_date, t.minimum_payment_cents,
             t.type = 'chequing' and not exists (
               select 1 from accounts p where p.user_id = t.user_id and p.is_primary
             )
      from taken t
      returning id, user_id
    ),
    statement as (
      insert into account_statements (user_id, account_id, closing_date,
                                      balance_cents, minimum_payment_cents,
                                      payment_due_date, credit_limit_cents,
                                      available_credit_cents, pdf_pathname,
                                      source, client)
      select t.user_id, m.id, t.statement_closing_date, t.statement_balance_cents,
             t.minimum_payment_cents, t.payment_due_date, t.credit_limit_cents,
             t.available_credit_cents, t.statement_pdf_pathname, t.source, t.client
      from taken t cross join made m
      where t.statement_closing_date is not null
        and t.statement_balance_cents is not null
      returning id
    )
    select m.id, (select count(*) from statement) as statements from made m
  `;
  return row ? String(row.id) : null;
}

/** Removes a proposal. Returns its statement PDF to remove, or null when it's gone. */
export async function deletePendingAccountRow(
  userId: string,
  id: string,
): Promise<{ pdfPathname: string | null } | null> {
  const [row] = await db()`
    delete from pending_accounts where id = ${id} and user_id = ${userId}
    returning statement_pdf_pathname
  `;
  if (!row) return null;
  return { pdfPathname: row.statement_pdf_pathname ?? null };
}
