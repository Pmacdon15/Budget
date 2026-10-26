import "server-only";
import { db } from "@/db/client";

/**
 * Raw SQL for undo after delete. Each delete removes the rows and keeps a copy
 * in `undo_deletes` in one statement, so there is never a delete without its
 * undo (or the other way round). Restores put the exact rows back, ids
 * included, so links (an expense's receipt, a paycheque's recurring income)
 * still hold. Callers (the DAL) handle auth and rules.
 */

export type UndoKind = "expense" | "fixed_item" | "income";

/**
 * Deletes the expense (and its receipt once no other split part uses it) and
 * keeps both for undo. A photo the delete orphaned is recorded, not removed:
 * it is deleted from storage once the undo window has passed. Returns the undo
 * id, or null when no row matched (missing, or not this user's).
 */
export async function deleteExpenseKeepingUndo(
  userId: string,
  id: string,
): Promise<string | null> {
  const rows = await db()`
    with removed as (
      delete from expenses where id = ${id} and user_id = ${userId}
      returning *
    ),
    kept_receipt as (
      select to_jsonb(r) as receipt
      from receipts r, removed
      where r.id = removed.receipt_id and r.user_id = ${userId}
    ),
    gone as (
      delete from receipts r using removed
      where r.id = removed.receipt_id and r.user_id = ${userId}
        -- The statement sees the table as it was, so skip the row being removed.
        and not exists (
          select 1 from expenses other
          where other.receipt_id = r.id and other.id <> removed.id
        )
      returning r.image_pathname
    ),
    saved as (
      insert into undo_deletes (user_id, kind, record, receipt, image_pathname)
      select ${userId}, 'expense', to_jsonb(removed),
             (select receipt from kept_receipt limit 1),
             (select image_pathname from gone limit 1)
      from removed
      returning id
    )
    select id from saved
  `;
  return rows[0]?.id ?? null;
}

/**
 * Stops a bill from `fromMonth` (ending it at `endMonth`), or deletes it when
 * it starts in or after `fromMonth`, keeping the original row for undo.
 * Returns the undo id, or null when no row matched.
 */
export async function stopFixedItemKeepingUndo(
  userId: string,
  id: string,
  fromMonth: string,
  endMonth: string,
): Promise<string | null> {
  const rows = await db()`
    with item as (
      select * from fixed_items where id = ${id} and user_id = ${userId}
    ),
    removed as (
      delete from fixed_items f using item
      where f.id = item.id and f.user_id = ${userId}
        and item.start_month >= ${fromMonth}
      returning f.id
    ),
    ended as (
      update fixed_items f set end_month = ${endMonth}
      from item
      where f.id = item.id and f.user_id = ${userId}
        and item.start_month < ${fromMonth}
      returning f.id
    ),
    saved as (
      insert into undo_deletes (user_id, kind, record)
      select ${userId}, 'fixed_item', to_jsonb(item) from item
      returning id
    )
    select id from saved
  `;
  return rows[0]?.id ?? null;
}

/** Deletes a take-home entry, keeping it for undo. Null when no row matched. */
export async function deleteIncomeKeepingUndo(
  userId: string,
  id: string,
): Promise<string | null> {
  const rows = await db()`
    with removed as (
      delete from income where id = ${id} and user_id = ${userId}
      returning *
    ),
    saved as (
      insert into undo_deletes (user_id, kind, record)
      select ${userId}, 'income', to_jsonb(removed) from removed
      returning id
    )
    select id from saved
  `;
  return rows[0]?.id ?? null;
}

/** What kind of delete an undo id belongs to, if it is this user's and still fresh. */
export async function selectUndoKind(
  userId: string,
  undoId: string,
  windowMinutes: number,
): Promise<UndoKind | null> {
  const rows = await db()`
    select kind from undo_deletes
    where id = ${undoId} and user_id = ${userId}
      and created_at > now() - make_interval(mins => ${windowMinutes}::int)
  `;
  return (rows[0]?.kind as UndoKind | undefined) ?? null;
}

/*
 * Restores take the undo entry (scoped to the user and the window) and put its
 * rows back in one statement, so an entry is used at most once. Each returns
 * false when nothing was restored.
 */

export async function restoreExpense(
  userId: string,
  undoId: string,
  windowMinutes: number,
): Promise<boolean> {
  const rows = await db()`
    with entry as (
      delete from undo_deletes
      where id = ${undoId} and user_id = ${userId} and kind = 'expense'
        and created_at > now() - make_interval(mins => ${windowMinutes}::int)
      returning record, receipt
    ),
    receipt as (
      -- Already there when another split part still uses it.
      insert into receipts
      select (jsonb_populate_record(null::receipts, entry.receipt)).*
      from entry
      where entry.receipt is not null and entry.receipt->>'user_id' = ${userId}
      on conflict (id) do nothing
    ),
    restored as (
      insert into expenses
      select (jsonb_populate_record(null::expenses, entry.record)).*
      from entry
      where entry.record->>'user_id' = ${userId}
      on conflict (id) do nothing
      returning id
    )
    select id from restored
  `;
  return rows.length > 0;
}

export async function restoreFixedItem(
  userId: string,
  undoId: string,
  windowMinutes: number,
): Promise<boolean> {
  const rows = await db()`
    with entry as (
      delete from undo_deletes
      where id = ${undoId} and user_id = ${userId} and kind = 'fixed_item'
        and created_at > now() - make_interval(mins => ${windowMinutes}::int)
      returning record
    ),
    restored as (
      -- A deleted bill comes back whole; a stopped one gets its end month back.
      insert into fixed_items
      select (jsonb_populate_record(null::fixed_items, entry.record)).*
      from entry
      where entry.record->>'user_id' = ${userId}
      on conflict (id) do update set end_month = excluded.end_month
        where fixed_items.user_id = ${userId}
      returning id
    )
    select id from restored
  `;
  return rows.length > 0;
}

export async function restoreIncome(
  userId: string,
  undoId: string,
  windowMinutes: number,
): Promise<boolean> {
  const rows = await db()`
    with entry as (
      delete from undo_deletes
      where id = ${undoId} and user_id = ${userId} and kind = 'income'
        and created_at > now() - make_interval(mins => ${windowMinutes}::int)
      returning record
    ),
    restored as (
      insert into income
      select (jsonb_populate_record(
        null::income,
        -- Keep the link to a repeating paycheque only if it still exists.
        entry.record || case
          when exists (
            select 1 from recurring_income ri
            where ri.id::text = entry.record->>'recurring_id'
              and ri.user_id = ${userId}
          ) then '{}'::jsonb
          else '{"recurring_id": null}'::jsonb
        end
        -- And the account it went into, and its receipt, only if they're
        -- still there.
        || case
          when entry.record->>'account_id' is null or exists (
            select 1 from accounts a
            where a.id::text = entry.record->>'account_id'
              and a.user_id = ${userId}
          ) then '{}'::jsonb
          else '{"account_id": null}'::jsonb
        end
        || case
          when entry.record->>'receipt_id' is null or exists (
            select 1 from receipts r
            where r.id::text = entry.record->>'receipt_id'
              and r.user_id = ${userId}
          ) then '{}'::jsonb
          else '{"receipt_id": null}'::jsonb
        end
      )).*
      from entry
      where entry.record->>'user_id' = ${userId}
      -- e.g. that month's paycheque was added again in the meantime.
      on conflict do nothing
      returning id
    )
    select id from restored
  `;
  return rows.length > 0;
}

/**
 * Drops this user's undo entries older than the window and returns the photos
 * they orphaned that nothing uses any more (no receipt, and no fresh undo entry
 * that could bring one back), so the caller can remove them from storage.
 */
export async function purgeExpiredUndo(
  userId: string,
  windowMinutes: number,
): Promise<string[]> {
  const rows = await db()`
    with purged as (
      delete from undo_deletes
      where user_id = ${userId}
        and created_at <= now() - make_interval(mins => ${windowMinutes}::int)
      returning image_pathname
    )
    select distinct p.image_pathname from purged p
    where p.image_pathname is not null
      and not exists (
        select 1 from receipts r where r.image_pathname = p.image_pathname
      )
      and not exists (
        select 1 from undo_deletes u
        where u.user_id = ${userId}
          and u.receipt->>'image_pathname' = p.image_pathname
          and u.created_at > now() - make_interval(mins => ${windowMinutes}::int)
      )
  `;
  return rows.map((r) => String(r.image_pathname));
}
