import "server-only";
import { db, type Row } from "@/db/client";
import type { RecurringIncome } from "@/lib/recurring-income";

/** Raw SQL for repeating take-home. Callers (the DAL) handle auth and rules. */

const toRecurring = (r: Row): RecurringIncome => ({
  id: r.id,
  label: r.label,
  amountCents: Number(r.amount_cents),
  startMonth: String(r.start_month),
  endMonth: r.end_month == null ? null : String(r.end_month),
});

/** Repeating paycheques active in `month`, with what happened to each that month. */
export async function selectRecurringForMonth(userId: string, month: string) {
  const rows = await db()`
    select r.id, r.label, r.amount_cents, r.start_month, r.end_month,
           i.amount_cents as added_cents,
           (s.recurring_id is not null) as skipped
    from recurring_income r
    left join income i
      on i.recurring_id = r.id and i.month = ${month} and i.user_id = r.user_id
    left join recurring_income_skips s
      on s.recurring_id = r.id and s.month = ${month} and s.user_id = r.user_id
    where r.user_id = ${userId}
      and r.start_month <= ${month}
      and (r.end_month is null or r.end_month >= ${month})
    order by r.created_at asc
  `;
  return rows.map((r) => ({
    ...toRecurring(r),
    addedCents: r.added_cents == null ? null : Number(r.added_cents),
    skipped: Boolean(r.skipped),
  }));
}

export async function selectRecurring(
  userId: string,
  id: string,
): Promise<RecurringIncome | null> {
  const [row] = await db()`
    select id, label, amount_cents, start_month, end_month
    from recurring_income
    where id = ${id} and user_id = ${userId}
  `;
  return row ? toRecurring(row) : null;
}

export async function insertRecurring(
  userId: string,
  values: { label: string; amountCents: number; startMonth: string },
) {
  await db()`
    insert into recurring_income (user_id, label, amount_cents, start_month)
    values (${userId}, ${values.label}, ${values.amountCents}, ${values.startMonth})
  `;
}

/** Changes the usual label and amount. Deposits already added keep theirs. */
export async function updateRecurringValues(
  userId: string,
  id: string,
  values: { label: string; amountCents: number },
) {
  await db()`
    update recurring_income
    set label = ${values.label}, amount_cents = ${values.amountCents}
    where id = ${id} and user_id = ${userId}
  `;
}

export async function setRecurringEndMonth(
  userId: string,
  id: string,
  endMonth: string,
) {
  await db()`
    update recurring_income set end_month = ${endMonth}
    where id = ${id} and user_id = ${userId}
  `;
}

/** Deposits it already became stay, unlinked (`on delete set null`). */
export async function deleteRecurringRow(userId: string, id: string) {
  await db()`delete from recurring_income where id = ${id} and user_id = ${userId}`;
}

/**
 * Adds the month's deposit, linked to its repeating paycheque, and clears any
 * skip for that month. Returns false when it was already added.
 */
export async function insertRecurringDeposit(
  userId: string,
  item: RecurringIncome,
  values: { month: string; amountCents: number; receivedOn: string | null },
): Promise<boolean> {
  const [, inserted] = await db().transaction((sql) => [
    sql`
      delete from recurring_income_skips
      where recurring_id = ${item.id} and month = ${values.month} and user_id = ${userId}
    `,
    sql`
      insert into income (user_id, month, label, amount_cents, received_on, recurring_id)
      select ${userId}, ${values.month}, ${item.label}, ${values.amountCents},
             ${values.receivedOn}, ${item.id}
      where not exists (
        select 1 from income
        where recurring_id = ${item.id} and month = ${values.month}
      )
      returning id
    `,
  ]);
  return (inserted?.length ?? 0) > 0;
}

export async function insertSkip(userId: string, id: string, month: string) {
  await db()`
    insert into recurring_income_skips (user_id, recurring_id, month)
    values (${userId}, ${id}, ${month})
    on conflict (recurring_id, month) do nothing
  `;
}

export async function deleteSkip(userId: string, id: string, month: string) {
  await db()`
    delete from recurring_income_skips
    where recurring_id = ${id} and month = ${month} and user_id = ${userId}
  `;
}
