import { describe, expect, it } from "vitest";
import {
  approvePendingExpense,
  editPendingExpense,
  rejectPendingExpense,
} from "@/actions/pending-expenses";
import { getPendingExpenses } from "@/dal/pending-expenses";
import { insertPendingExpense } from "@/db/pending-expenses";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const item = (userId = "user_a") =>
  insertPendingExpense(userId, {
    spentOn: "2026-10-20",
    description: "Shell",
    merchant: "Shell",
    category: "Transportation",
    amountCents: 4_567,
    source: "Email from receipts@shell.ca",
    client: "Claude",
  });

const expenses = () =>
  rows(
    "select user_id, month, spent_on::text as spent_on, description, category, amount_cents from expenses",
  );

describe("pending review actions", () => {
  it("lists the signed-in user's items with where they came from", async () => {
    await item();
    await item("user_b");
    expect(await getPendingExpenses()).toEqual([
      expect.objectContaining({
        description: "Shell",
        amountCents: 4_567,
        source: "Email from receipts@shell.ca",
        client: "Claude",
        possibleDuplicate: false,
      }),
    ]);
  });

  it("flags an item that matches a saved expense", async () => {
    await item();
    await rows(
      "insert into expenses (user_id, month, spent_on, description, category, amount_cents) values ('user_a', '2026-10', '2026-10-20', 'Gas', 'Transportation', 4567)",
    );
    expect((await getPendingExpenses())[0]?.possibleDuplicate).toBe(true);
  });

  it("approving saves it as a normal expense, once", async () => {
    const id = await item();
    expect(await approvePendingExpense(id)).toEqual({ ok: true });
    expect(await expenses()).toEqual([
      {
        user_id: "user_a",
        month: "2026-10",
        spent_on: "2026-10-20",
        description: "Shell",
        category: "Transportation",
        amount_cents: 4_567,
      },
    ]);
    expect(await getPendingExpenses()).toEqual([]);
    expect(await approvePendingExpense(id)).toMatchObject({
      ok: false,
      error: "That item was already handled. Refresh to see what's left.",
    });
    expect(await expenses()).toHaveLength(1);
  });

  it("saves edits before approving", async () => {
    const id = await item();
    expect(
      await editPendingExpense(id, {
        description: "Shell (truck)",
        category: "Auto",
        amount: "50.00",
        spentOn: "2026-11-02",
      }),
    ).toEqual({ ok: true });
    await approvePendingExpense(id);
    expect(await expenses()).toEqual([
      expect.objectContaining({
        month: "2026-11",
        description: "Shell (truck)",
        category: "Auto",
        amount_cents: 5_000,
      }),
    ]);
  });

  it("reports an edit it can't accept next to the field", async () => {
    const id = await item();
    expect(
      await editPendingExpense(id, {
        description: "Shell",
        category: "Transportation",
        amount: "abc",
        spentOn: "2026-10-20",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(Array) } });
  });

  it("rejecting throws it away without saving", async () => {
    const id = await item();
    expect(await rejectPendingExpense(id)).toEqual({ ok: true });
    expect(await rows("select * from pending_expenses")).toHaveLength(0);
    expect(await expenses()).toHaveLength(0);
  });

  it("can't approve, edit or reject another user's item", async () => {
    const id = await item("user_b");
    expect(await approvePendingExpense(id)).toMatchObject({ ok: false });
    expect(await rejectPendingExpense(id)).toMatchObject({ ok: false });
    expect(
      await editPendingExpense(id, {
        description: "x",
        category: "Other",
        amount: "1",
        spentOn: "2026-10-20",
      }),
    ).toMatchObject({ ok: false });
    expect(await expenses()).toHaveLength(0);
    signInAs("user_b");
    expect(await getPendingExpenses()).toHaveLength(1);
  });

  it("refuses when signed out", async () => {
    const id = await item();
    signOut();
    expect(await approvePendingExpense(id)).toMatchObject({ ok: false });
    expect(await expenses()).toHaveLength(0);
  });
});
