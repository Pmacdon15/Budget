import { revalidatePath, updateTag } from "next/cache";
import { describe, expect, it } from "vitest";
import { createExpense, deleteExpense } from "@/actions/expenses";
import { createFixedItem } from "@/actions/fixed-items";
import { userDataTag } from "@/db/cache-tags";
import type { ExpenseFormValues } from "@/lib/schemas";
import { signInAs, signOut } from "../../helpers/auth";

/*
 * `revalidatePath` clears the route cache but not the `"use cache"` entries in
 * `src/db`, which are keyed by tag. So every successful mutation has to call
 * `updateTag` as well, or the user reads their own write back stale. These
 * tests are the guard on that: they fail if the tag call is dropped from
 * `runAction`, which is the one place every web mutation goes through.
 */

const form: ExpenseFormValues = {
  description: "Costco run",
  category: "Groceries",
  amount: "$123.45",
  spentOn: "2026-10-05",
};
const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

describe("cache invalidation after a mutation", () => {
  it("clears the signed-in user's cached reads after a write", async () => {
    expect(await createExpense(form)).toEqual({ ok: true });

    expect(updateTag).toHaveBeenCalledWith(userDataTag("user_a"));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("clears only the user who made the write", async () => {
    signInAs("user_b");

    expect(await createExpense(form)).toEqual({ ok: true });

    expect(updateTag).toHaveBeenCalledWith(userDataTag("user_b"));
    expect(updateTag).not.toHaveBeenCalledWith(userDataTag("user_a"));
  });

  it("clears the cache for a write through any action, not just expenses", async () => {
    const result = await createFixedItem({
      name: "Rent",
      category: "Housing",
      amount: "1500",
      dueDay: "1",
      month: "2026-10",
    });

    expect(result.ok).toBe(true);
    expect(updateTag).toHaveBeenCalledWith(userDataTag("user_a"));
  });

  it("leaves the cache alone when the input was invalid", async () => {
    const result = await createExpense({ ...form, amount: "not money" });

    expect(result.ok).toBe(false);
    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("leaves the cache alone when the row wasn't the user's to delete", async () => {
    const result = await deleteExpense(MISSING_ID);

    expect(result.ok).toBe(false);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("leaves the cache alone, and reports it, when nobody is signed in", async () => {
    signOut();

    const result = await createExpense(form);

    expect(result.ok).toBe(false);
    expect(updateTag).not.toHaveBeenCalled();
  });
});
