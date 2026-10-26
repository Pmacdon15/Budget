import "server-only";
import { db, type Row } from "@/db/client";
import type { DuplicateMatch, PendingExpense } from "@/lib/pending-expenses";

/** Raw SQL for expenses waiting for review. Callers handle auth and rules. */

export type PendingValues = {
  spentOn: string;
  description: string;
  merchant: string | null;
  category: string;
  amountCents: number;
  source: string | null;
  client: string | null;
};

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
});

/** Saves an item for review and returns its id. */
export async function insertPendingExpense(
  userId: string,
  values: PendingValues,
): Promise<string> {
  const [row] = await db()`
    insert into pending_expenses (user_id, spent_on, description, merchant,
                                  category, amount_cents, source, client)
    values (${userId}, ${values.spentOn}, ${values.description}, ${values.merchant},
            ${values.category}, ${values.amountCents}, ${values.source}, ${values.client})
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
           p.amount_cents, p.source, p.client, p.created_at,
           exists (
             select 1 from expenses e
             where e.user_id = p.user_id and e.spent_on = p.spent_on
             group by coalesce(e.receipt_id, e.id)
             having sum(e.amount_cents) = p.amount_cents
           ) as possible_duplicate
    from pending_expenses p
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
    "spentOn" | "description" | "category" | "amountCents"
  >,
): Promise<boolean> {
  const rows = await db()`
    update pending_expenses
    set spent_on = ${values.spentOn}, description = ${values.description},
        category = ${values.category}, amount_cents = ${values.amountCents}
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/**
 * Turns the item into a normal expense and removes it from review, in one
 * statement, so approving twice can never save it twice. Returns false when no
 * row matched (missing, already handled, or not this user's).
 */
export async function approvePendingExpense(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    with taken as (
      delete from pending_expenses
      where id = ${id} and user_id = ${userId}
      returning user_id, spent_on, description, category, amount_cents
    )
    insert into expenses (user_id, month, spent_on, description, category, amount_cents)
    select user_id, to_char(spent_on, 'YYYY-MM'), spent_on, description,
           category, amount_cents
    from taken
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
