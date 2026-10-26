import "server-only";
import { deleteAccountRow, selectAccounts } from "@/db/accounts";
import { db } from "@/db/client";
import type { BankBalance } from "@/lib/bank-balance";

/**
 * Raw SQL for the bank balance: the primary chequing account's balance, the
 * one expenses come off. (Before accounts it was its own table,
 * bank_balances, which the accounts migration copied into a default chequing
 * account.) Callers (the DAL) handle auth.
 */

/**
 * The primary account's balance now, or null when there's no primary chequing
 * account. Worked out on read (see selectAccounts): what was entered, less
 * expenses and paid bills that came after it, adjusted by transfers since.
 * Anything dated before the day it was entered is already in the number, so
 * it never comes off twice.
 */
export async function selectBankBalance(
  userId: string,
): Promise<BankBalance | null> {
  const primary = (await selectAccounts(userId)).find((a) => a.isPrimary);
  if (!primary) return null;
  return {
    accountId: primary.id,
    accountName: primary.name,
    balanceCents: primary.balanceCents,
    enteredCents: primary.enteredCents,
    spentSinceCents: primary.spentSinceCents,
    transfersSinceCents: primary.transfersSinceCents,
    updatedAt: primary.balanceAsOf,
  };
}

/**
 * Sets the primary account's balance as of now, replacing the last one.
 * Expenses added from now on come off it. With no primary account yet, makes
 * one ("Chequing"), so entering a balance always works.
 */
export async function upsertBankBalance(
  userId: string,
  balanceCents: number,
  source = "manual",
) {
  await db()`
    with updated as (
      update accounts set balance_cents = ${balanceCents},
                          balance_as_of = now(),
                          balance_source = ${source},
                          updated_at = now()
      where user_id = ${userId} and is_primary
      returning id
    )
    insert into accounts (user_id, type, name, balance_cents, balance_as_of,
                          balance_source, is_primary)
    select ${userId}, 'chequing', 'Chequing', ${balanceCents}, now(),
           ${source}, true
    where not exists (select 1 from updated)
  `;
}

/**
 * Removes the primary account (the balance card's "Remove"). Returns its
 * statement PDFs to remove, or null when there was nothing to remove.
 */
export async function deleteBankBalance(
  userId: string,
): Promise<{ pdfPathnames: string[] } | null> {
  const primary = (await selectAccounts(userId)).find((a) => a.isPrimary);
  if (!primary) return null;
  return deleteAccountRow(userId, primary.id);
}
