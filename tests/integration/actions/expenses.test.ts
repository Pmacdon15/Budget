import { revalidatePath } from "next/cache";
import { describe, expect, it } from "vitest";
import { createExpense, deleteExpense, updateExpense } from "@/actions/expenses";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const form = {
  description: "Costco run",
  category: "Groceries",
  amount: "$123.45",
  spentOn: "2026-10-05",
};
const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

const expenseRows = () =>
  rows(
    "select id, user_id, month, description, category, amount_cents from expenses order by created_at",
  );

describe("expense actions", () => {
  it("creates an expense for the signed-in user, in the month it was spent", async () => {
    expect(await createExpense(form)).toEqual({ ok: true });
    expect(await expenseRows()).toEqual([
      {
        id: expect.any(String),
        user_id: "user_a",
        month: "2026-10",
        description: "Costco run",
        category: "Groceries",
        amount_cents: 12_345,
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("moves an expense to a new month when its date changes", async () => {
    await createExpense(form);
    const [row] = await expenseRows();
    expect(
      await updateExpense(row?.id as string, {
        ...form,
        spentOn: "2026-11-02",
        amount: "50",
      }),
    ).toEqual({ ok: true });
    expect(await expenseRows()).toMatchObject([
      { month: "2026-11", amount_cents: 5_000 },
    ]);
  });

  it("deletes an expense", async () => {
    await createExpense(form);
    const [row] = await expenseRows();
    expect(await deleteExpense(row?.id as string)).toEqual({ ok: true });
    expect(await expenseRows()).toEqual([]);
  });

  it("returns field errors and writes nothing for invalid input", async () => {
    const result = await createExpense({
      ...form,
      amount: "12.345",
      category: "Yachts",
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        amount: ["Enter a valid amount, like 1250.00"],
        category: ["Pick a category"],
      },
    });
    expect(await expenseRows()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed id", async () => {
    expect(await deleteExpense("not-a-uuid")).toMatchObject({
      ok: false,
      error: "Invalid id",
    });
  });

  it("says when the expense is gone", async () => {
    expect(await deleteExpense(MISSING_ID)).toEqual({
      ok: false,
      error: "That item no longer exists.",
    });
    expect(await updateExpense(MISSING_ID, form)).toEqual({
      ok: false,
      error: "That item no longer exists.",
    });
  });

  it("can't change another user's expense", async () => {
    await createExpense(form);
    const [row] = await expenseRows();
    signInAs("user_b");
    expect(await updateExpense(row?.id as string, form)).toMatchObject({
      ok: false,
    });
    expect(await deleteExpense(row?.id as string)).toMatchObject({ ok: false });
    expect(await expenseRows()).toHaveLength(1);
  });

  it("refuses to write when signed out", async () => {
    signOut();
    expect(await createExpense(form)).toEqual({
      ok: false,
      error: "You're signed out. Sign in again and retry.",
    });
    expect(await expenseRows()).toEqual([]);
  });
});
