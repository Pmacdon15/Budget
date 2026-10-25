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
 * entered, less every expense added after it. The test database's clock can
 * tick too coarsely to order two quick writes, so these tests set the
 * timestamps they depend on explicitly.
 */

const form = (amount: string, description = "Shell"): ExpenseFormValues => ({
  description,
  category: "Transportation",
  amount,
  spentOn: "2026-10-20",
});

/** Enters a balance and marks it as entered an hour ago. */
async function enterBalance(balance: string) {
  await setBankBalance({ balance });
  await rows(
    "update bank_balances set updated_at = now() - interval '1 hour' where user_id = $1",
    ["user_a"],
  );
}

/** Marks every existing expense as added two hours ago, before the balance. */
const backdateExpenses = () =>
  rows("update expenses set created_at = now() - interval '2 hours'");

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
});
