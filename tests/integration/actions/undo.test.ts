import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExpense } from "@/actions/expenses";
import { createFixedItem } from "@/actions/fixed-items";
import { createIncome } from "@/actions/income";
import { recordRecurringIncome } from "@/actions/recurring-income";
import {
  deleteExpenseWithUndo,
  deleteIncomeWithUndo,
  stopFixedItemWithUndo,
  type UndoableResult,
  undoDelete,
} from "@/actions/undo";
import { deleteReceiptImage } from "@/lib/receipt-store";
import type { ExpenseFormValues } from "@/lib/schemas";
import { UNDO_WINDOW_MINUTES } from "@/lib/undo";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const OWN_PHOTO = "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg";
const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

const scanned: ExpenseFormValues = {
  description: "Costco",
  category: "Groceries",
  amount: "113.00",
  spentOn: "2026-10-05",
  receiptImage: OWN_PHOTO,
  receiptMerchant: "Costco Wholesale",
  receiptPurchasedOn: "2026-10-05",
  receiptSubtotal: "100.00",
  receiptTax: "13.00",
  receiptTotal: "113.00",
  receiptText: "COSTCO\nTOTAL 113.00",
};

function undoIdOf(result: UndoableResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  expect(result.undoId).toMatch(/^[0-9a-f-]{36}$/);
  return result.undoId;
}

/** Makes every undo entry older than the window. */
const expireUndo = () =>
  rows(
    `update undo_deletes set created_at = now() - make_interval(mins => ${UNDO_WINDOW_MINUTES + 1})`,
  );

/** The next undoable delete clears what has expired. */
async function triggerPurge() {
  await createIncome({
    label: "Bonus",
    amount: "100",
    month: "2026-10",
    receivedOn: "",
  });
  const [income] = await rows("select id from income");
  await deleteIncomeWithUndo(income?.id as string);
}

const expenseRows = () =>
  rows(
    "select id, description, category, amount_cents, receipt_id, created_at::text from expenses order by category",
  );

beforeEach(() => {
  vi.mocked(deleteReceiptImage).mockClear();
});

describe("undo after deleting an expense", () => {
  it("puts the expense back exactly as it was", async () => {
    await createExpense({
      description: "Gas",
      category: "Transportation",
      amount: "60",
      spentOn: "2026-10-06",
    });
    const before = await expenseRows();
    const undoId = undoIdOf(
      await deleteExpenseWithUndo(before[0]?.id as string),
    );
    expect(await expenseRows()).toEqual([]);

    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await expenseRows()).toEqual(before);
  });

  it("restores the receipt link and keeps the photo while undo is possible", async () => {
    await createExpense(scanned);
    const [receipt] = await rows("select * from receipts");
    const [expense] = await expenseRows();
    const undoId = undoIdOf(await deleteExpenseWithUndo(expense?.id as string));

    expect(await rows("select id from receipts")).toEqual([]);
    expect(deleteReceiptImage).not.toHaveBeenCalled();

    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await rows("select * from receipts")).toEqual([receipt]);
    expect((await expenseRows())[0]?.receipt_id).toBe(receipt?.id);
  });

  it("restores one part of a split receipt while the other part still uses it", async () => {
    await createExpense({
      ...scanned,
      splits: JSON.stringify([
        { category: "Groceries", amount: "80.00" },
        { category: "Alcohol", amount: "33.00" },
      ]),
    });
    const [receipt] = await rows("select id from receipts");
    const [alcohol] = await expenseRows();
    const undoId = undoIdOf(await deleteExpenseWithUndo(alcohol?.id as string));
    expect(await rows("select id from receipts")).toEqual([receipt]);

    expect(await undoDelete(undoId)).toEqual({ ok: true });
    const parts = await expenseRows();
    expect(parts.map((p) => p.receipt_id)).toEqual([receipt?.id, receipt?.id]);
  });

  it("removes the photo only after the undo window has passed", async () => {
    await createExpense(scanned);
    const [expense] = await expenseRows();
    await deleteExpenseWithUndo(expense?.id as string);
    await expireUndo();
    await triggerPurge();

    expect(deleteReceiptImage).toHaveBeenCalledWith(OWN_PHOTO);
    expect(await rows("select kind from undo_deletes")).toEqual([
      { kind: "income" },
    ]);
  });

  it("keeps the photo when the receipt was restored by another undo", async () => {
    await createExpense({
      ...scanned,
      splits: JSON.stringify([
        { category: "Groceries", amount: "80.00" },
        { category: "Alcohol", amount: "33.00" },
      ]),
    });
    const [alcohol, groceries] = await expenseRows();
    const first = undoIdOf(await deleteExpenseWithUndo(alcohol?.id as string));
    undoIdOf(await deleteExpenseWithUndo(groceries?.id as string)); // orphans the photo
    expect(await rows("select id from receipts")).toEqual([]);

    // Undoing the first part brings the receipt (and its photo) back.
    expect(await undoDelete(first)).toEqual({ ok: true });
    await expireUndo();
    await triggerPurge();

    expect(deleteReceiptImage).not.toHaveBeenCalled();
    expect(await rows("select image_pathname from receipts")).toEqual([
      { image_pathname: OWN_PHOTO },
    ]);
  });
});

describe("undo after stopping or deleting a bill", () => {
  async function createRent(month = "2026-01") {
    await createFixedItem({
      name: "Rent",
      category: "Housing",
      amount: "1500",
      dueDay: "1",
      month,
    });
    const [rent] = await rows("select * from fixed_items");
    return rent as { id: string };
  }

  it("gives a stopped bill its end month back", async () => {
    const rent = await createRent("2026-01");
    const undoId = undoIdOf(await stopFixedItemWithUndo(rent.id, "2026-07"));
    expect(await rows("select end_month from fixed_items")).toEqual([
      { end_month: "2026-06" },
    ]);

    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await rows("select * from fixed_items")).toEqual([rent]);
  });

  it("brings back a bill deleted in its first month", async () => {
    const rent = await createRent("2026-07");
    const undoId = undoIdOf(await stopFixedItemWithUndo(rent.id, "2026-07"));
    expect(await rows("select id from fixed_items")).toEqual([]);

    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await rows("select * from fixed_items")).toEqual([rent]);
  });

  it("validates the month", async () => {
    expect(await stopFixedItemWithUndo(MISSING_ID, "bad month")).toMatchObject({
      ok: false,
    });
  });
});

describe("undo after deleting take-home", () => {
  it("puts the entry back", async () => {
    await createIncome({
      label: "Paycheque",
      amount: "2500",
      month: "2026-10",
      receivedOn: "2026-10-15",
    });
    const before = await rows("select * from income");
    const undoId = undoIdOf(
      await deleteIncomeWithUndo(before[0]?.id as string),
    );
    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await rows("select * from income")).toEqual(before);
  });

  it("keeps the link to its repeating paycheque", async () => {
    const [pay] = await rows(
      `insert into recurring_income (user_id, label, amount_cents, start_month)
       values ('user_a', 'Paycheque', 250000, '2026-03') returning id`,
    );
    await recordRecurringIncome({
      recurringId: pay?.id as string,
      month: "2026-03",
      amount: "2500",
      receivedOn: "",
    });
    const [deposit] = await rows("select id, recurring_id from income");
    const undoId = undoIdOf(await deleteIncomeWithUndo(deposit?.id as string));
    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await rows("select id, recurring_id from income")).toEqual([
      deposit,
    ]);
  });

  it("can't be undone once that month's paycheque was added again", async () => {
    const [pay] = await rows(
      `insert into recurring_income (user_id, label, amount_cents, start_month)
       values ('user_a', 'Paycheque', 250000, '2026-03') returning id`,
    );
    const add = () =>
      recordRecurringIncome({
        recurringId: pay?.id as string,
        month: "2026-03",
        amount: "2500",
        receivedOn: "",
      });
    await add();
    const [deposit] = await rows("select id from income");
    const undoId = undoIdOf(await deleteIncomeWithUndo(deposit?.id as string));
    await add();

    expect(await undoDelete(undoId)).toEqual({
      ok: false,
      error: "That can't be undone any more.",
    });
    expect(await rows("select id from income")).toHaveLength(1);
  });
});

describe("undo is checked on the server", () => {
  async function deletedGas() {
    await createExpense({
      description: "Gas",
      category: "Transportation",
      amount: "60",
      spentOn: "2026-10-06",
    });
    const [expense] = await rows("select id from expenses");
    return undoIdOf(await deleteExpenseWithUndo(expense?.id as string));
  }

  it("only works for the user who deleted it", async () => {
    const undoId = await deletedGas();
    signInAs("user_b");
    expect(await undoDelete(undoId)).toEqual({
      ok: false,
      error: "That can't be undone any more.",
    });
    expect(await rows("select id from expenses")).toEqual([]);

    signInAs("user_a");
    expect(await undoDelete(undoId)).toEqual({ ok: true });
  });

  it("works once", async () => {
    const undoId = await deletedGas();
    expect(await undoDelete(undoId)).toEqual({ ok: true });
    expect(await undoDelete(undoId)).toMatchObject({ ok: false });
    expect(await rows("select id from expenses")).toHaveLength(1);
  });

  it("stops working after the window", async () => {
    const undoId = await deletedGas();
    await expireUndo();
    expect(await undoDelete(undoId)).toMatchObject({ ok: false });
    expect(await rows("select id from expenses")).toEqual([]);
  });

  it("rejects bad ids and signed-out callers", async () => {
    expect(await undoDelete("nope")).toMatchObject({ ok: false });
    expect(await undoDelete(MISSING_ID)).toMatchObject({ ok: false });
    const undoId = await deletedGas();
    signOut();
    expect(await undoDelete(undoId)).toMatchObject({ ok: false });
  });

  it("won't delete another user's rows", async () => {
    await createExpense({
      description: "Gas",
      category: "Transportation",
      amount: "60",
      spentOn: "2026-10-06",
    });
    const [expense] = await rows("select id from expenses");
    signInAs("user_b");
    expect(await deleteExpenseWithUndo(expense?.id as string)).toEqual({
      ok: false,
      error: "That item no longer exists.",
    });
    expect(await rows("select id from expenses")).toHaveLength(1);
    expect(await rows("select id from undo_deletes")).toEqual([]);
  });
});
