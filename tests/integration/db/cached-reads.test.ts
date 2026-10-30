import { cacheLife, cacheTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { selectAccounts } from "@/db/accounts";
import { userDataTag } from "@/db/cache-tags";
import { insertExpense, selectExpensesBetween } from "@/db/expenses";
import { insertFixedItem, selectFixedItems } from "@/db/fixed-items";
import { insertIncome, selectIncomeBetween } from "@/db/income";

/*
 * The reads behind `buildMonthOverview` are `"use cache"` scopes. Caching lives
 * here, in `src/db`, and not in `src/dal`: these take `userId` as an argument
 * and never read `cookies()`, which a cached scope can't do. The DAL still does
 * the session check, so the cache can't be reached without one.
 *
 * `cacheTag` and `cacheLife` are mocked in tests/setup/integration.ts (they only
 * work inside a real cache scope), so what's checked here is that each read
 * tags itself for the right user and declares a lifetime — and still returns
 * the same rows it did before the directive was added.
 */

const tagsFor = (userId: string) =>
  vi
    .mocked(cacheTag)
    .mock.calls.flat()
    .filter((tag) => tag.includes(userId));

describe("cached db reads", () => {
  it("tags the user's expenses and sets a lifetime", async () => {
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-05",
      description: "Costco run",
      category: "Groceries",
      amountCents: 12_345,
    });

    const expenses = await selectExpensesBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );

    expect(expenses).toHaveLength(1);
    expect(cacheTag).toHaveBeenCalledWith(userDataTag("user_a"));
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("tags the user's fixed items", async () => {
    await insertFixedItem("user_a", {
      name: "Rent",
      category: "Housing",
      amountCents: 150_000,
      dueDay: 1,
      startMonth: "2026-10",
    });

    expect(await selectFixedItems("user_a")).toHaveLength(1);
    expect(cacheTag).toHaveBeenCalledWith(userDataTag("user_a"));
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("tags the user's income", async () => {
    await insertIncome("user_a", {
      month: "2026-10",
      label: "Paycheque",
      amountCents: 300_000,
      receivedOn: null,
    });

    expect(
      await selectIncomeBetween("user_a", "2026-10", "2026-10"),
    ).toHaveLength(1);
    expect(cacheTag).toHaveBeenCalledWith(userDataTag("user_a"));
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("tags the user's accounts", async () => {
    await selectAccounts("user_a");

    expect(cacheTag).toHaveBeenCalledWith(userDataTag("user_a"));
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  /*
   * The important one: `userId` is an argument, so it's part of the cache key,
   * and each user's entry carries only their own tag. Without that, one user's
   * cached rows could be served to another, or cleared by their write.
   */
  it("keeps one user's tag off another user's entry", async () => {
    await selectFixedItems("user_a");
    expect(tagsFor("user_a")).toEqual([userDataTag("user_a")]);
    expect(tagsFor("user_b")).toEqual([]);

    vi.mocked(cacheTag).mockClear();

    await selectFixedItems("user_b");
    expect(tagsFor("user_b")).toEqual([userDataTag("user_b")]);
    expect(tagsFor("user_a")).toEqual([]);
  });

  it("still scopes rows to the user it was asked for", async () => {
    await insertFixedItem("user_a", {
      name: "Rent",
      category: "Housing",
      amountCents: 150_000,
      dueDay: 1,
      startMonth: "2026-10",
    });

    expect(await selectFixedItems("user_a")).toHaveLength(1);
    expect(await selectFixedItems("user_b")).toEqual([]);
  });
});
