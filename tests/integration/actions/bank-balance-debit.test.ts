import { describe, expect, it } from "vitest";
import { clearBankBalance, setBankBalance } from "@/actions/bank-balance";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/actions/expenses";
import { deleteExpenseWithUndo, undoDelete } from "@/actions/undo";
import { getBankBalance } from "@/dal/bank-balance";
import type { ExpenseFormValues } from "@/lib/schemas";
import { signInAs } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

/*
 * Expenses come off the bank balance: the balance shown is the one last
 * entered, less every expense added after it and dated on or after the day it
 * was entered. The test database's clock can tick too coarsely to order two
 * quick writes, so these tests set the timestamps they depend on explicitly.
 */

/** When the balance counts as entered: Oct 1 at noon in Regina. */
const BALANCE_SET_AT = "2026-10-01T18:00:00Z";

const form = (amount: string, description = "Shell"): ExpenseFormValues => ({
  description,
  category: "Transportation",
  amount,
  spentOn: "2026-10-20",
});

/** Enters a balance and marks it as entered on Oct 1. */
async function enterBalance(balance: string) {
  await setBankBalance({ balance });
  await rows("update accounts set balance_as_of = $1 where user_id = $2", [
    BALANCE_SET_AT,
    "user_a",
  ]);
}

/** Marks every existing expense as added on Sep 30, before the balance. */
const backdateExpenses = () =>
  rows("update expenses set created_at = '2026-09-30T18:00:00Z'");

const onlyExpenseId = async () => {
  const [row] = await rows("select id from expenses");
  return String(row?.id);
};

describe("bank balance debiting", () => {
  it("takes a new expense off the balance", async () => {
    await enterBalance("1000");
    await createExpense(form("45.50"));
    expect(await getBankBalance()).toMatchObject({
      balanceCents: 95_450,
      enteredCents: 100_000,
      spentSinceCents: 4_550,
    });
  });

  it("takes off every part of a split expense once", async () => {
    await enterBalance("100");
    expect(
      await createExpense({
        ...form("30"),
        splits: JSON.stringify([
          { category: "Groceries", amount: "20" },
          { category: "Alcohol", amount: "10" },
        ]),
      }),
    ).toEqual({ ok: true });
    expect(await rows("select id from expenses")).toHaveLength(2);
    expect((await getBankBalance())?.balanceCents).toBe(7_000);
  });

  it("can take the balance below zero", async () => {
    await enterBalance("20");
    await createExpense(form("35"));
    expect((await getBankBalance())?.balanceCents).toBe(-1_500);
  });

  it("leaves out expenses added before the balance was entered", async () => {
    await createExpense(form("80"));
    await backdateExpenses();
    await enterBalance("500");
    expect(await getBankBalance()).toMatchObject({
      balanceCents: 50_000,
      spentSinceCents: 0,
    });
  });

  it("starts fresh when a new balance is entered", async () => {
    await enterBalance("500");
    await createExpense(form("80"));
    expect((await getBankBalance())?.balanceCents).toBe(42_000);
    await backdateExpenses();
    await enterBalance("420");
    expect((await getBankBalance())?.balanceCents).toBe(42_000);
  });

  it("follows an edited amount", async () => {
    await enterBalance("100");
    await createExpense(form("10"));
    await updateExpense(await onlyExpenseId(), form("25"));
    expect((await getBankBalance())?.balanceCents).toBe(7_500);
  });

  it("gives a deleted expense back", async () => {
    await enterBalance("100");
    await createExpense(form("10"));
    await deleteExpense(await onlyExpenseId());
    expect((await getBankBalance())?.balanceCents).toBe(10_000);
  });

  it("takes an undone delete off again, exactly once", async () => {
    await enterBalance("100");
    await createExpense(form("10"));
    const removed = await deleteExpenseWithUndo(await onlyExpenseId());
    expect((await getBankBalance())?.balanceCents).toBe(10_000);
    if (!removed.ok) throw new Error(removed.error);
    await undoDelete(removed.undoId);
    expect((await getBankBalance())?.balanceCents).toBe(9_000);
  });

  it("only takes off the signed-in user's expenses", async () => {
    await enterBalance("100");
    signInAs("user_b");
    await createExpense(form("60"));
    signInAs("user_a");
    expect((await getBankBalance())?.balanceCents).toBe(10_000);
  });

  it("has nothing to debit once the balance is cleared", async () => {
    await enterBalance("100");
    await createExpense(form("10"));
    await clearBankBalance();
    expect(await getBankBalance()).toBeNull();
  });

  describe("dated before the balance", () => {
    it("leaves an older charge out even when it's added afterwards", async () => {
      // e.g. approved from Review after the bank's balance was synced.
      await enterBalance("1000");
      await createExpense({ ...form("80"), spentOn: "2026-09-28" });
      expect(await getBankBalance()).toMatchObject({
        balanceCents: 100_000,
        spentSinceCents: 0,
      });
    });

    it("counts a charge dated the same day the balance was set", async () => {
      await enterBalance("1000");
      await createExpense({ ...form("80"), spentOn: "2026-10-01" });
      expect((await getBankBalance())?.balanceCents).toBe(92_000);
    });

    it("uses the day in Regina, not UTC", async () => {
      // 11:30 p.m. on Oct 1 in Regina is already Oct 2 in UTC.
      await setBankBalance({ balance: "1000" });
      await rows("update accounts set balance_as_of = $1", [
        "2026-10-02T05:30:00Z",
      ]);
      await createExpense({ ...form("80"), spentOn: "2026-10-01" });
      expect((await getBankBalance())?.balanceCents).toBe(92_000);
    });

    it("starts counting a moved expense once its date is on or after the balance", async () => {
      await enterBalance("1000");
      await createExpense({ ...form("80"), spentOn: "2026-09-28" });
      expect((await getBankBalance())?.balanceCents).toBe(100_000);
      await updateExpense(await onlyExpenseId(), {
        ...form("80"),
        spentOn: "2026-10-03",
      });
      expect((await getBankBalance())?.balanceCents).toBe(92_000);
    });
  });
});
