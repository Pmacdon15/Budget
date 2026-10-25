import "server-only";
import { db } from "@/db/client";
import type { BankBalance } from "@/lib/bank-balance";

/** Raw SQL for the bank balance. Callers (the DAL) handle auth. */

function toIso(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}

export async function selectBankBalance(
  userId: string,
): Promise<BankBalance | null> {
  const [row] = await db()`
    select balance_cents, updated_at from bank_balances where user_id = ${userId}
  `;
  if (!row) return null;
  return {
    balanceCents: Number(row.balance_cents),
    updatedAt: toIso(row.updated_at),
  };
}

/** Saves the balance, replacing the last one, and stamps the time. */
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
