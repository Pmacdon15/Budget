import "server-only";
import { db } from "@/db/client";
import type { BankBalance } from "@/lib/bank-balance";

/** Raw SQL for the bank balance. Callers (the DAL) handle auth. */

function toIso(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}

/**
 * The balance the user last entered, less every expense added after it.
 *
 * The debit is worked out on read instead of being written into the row, so
 * editing, deleting or undoing an expense can never leave it wrong: whatever
 * expenses exist now, and were added after the balance, are what come off.
 * Expenses added before it are already in the number the bank showed, so
 * entering a new balance starts fresh and nothing is taken off twice.
 */
export async function selectBankBalance(
  userId: string,
): Promise<BankBalance | null> {
  const [row] = await db()`
    select b.balance_cents, b.updated_at,
           coalesce((
             select sum(e.amount_cents) from expenses e
             where e.user_id = b.user_id and e.created_at > b.updated_at
           ), 0) as spent_since_cents
    from bank_balances b
    where b.user_id = ${userId}
  `;
  if (!row) return null;
  const enteredCents = Number(row.balance_cents);
  const spentSinceCents = Number(row.spent_since_cents);
  return {
    balanceCents: enteredCents - spentSinceCents,
    enteredCents,
    spentSinceCents,
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Saves the balance, replacing the last one, and stamps the time. Expenses
 * added from now on come off it.
 */
export async function upsertBankBalance(userId: string, balanceCents: number) {
  await db()`
    insert into bank_balances (user_id, balance_cents, updated_at)
    values (${userId}, ${balanceCents}, now())
    on conflict (user_id)
    do update set balance_cents = excluded.balance_cents, updated_at = now()
  `;
}

/** Returns false when there was nothing to remove. */
export async function deleteBankBalance(userId: string): Promise<boolean> {
  const rows = await db()`
    delete from bank_balances where user_id = ${userId} returning user_id
  `;
  return rows.length > 0;
}
