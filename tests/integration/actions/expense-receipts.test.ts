import { describe, expect, it, vi } from "vitest";
import { createExpense, deleteExpense } from "@/actions/expenses";
import { deleteReceiptImage } from "@/lib/receipt-store";
import type { ExpenseFormValues } from "@/lib/schemas";
import { rows } from "../../helpers/test-db";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const OWN_PHOTO = "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg";

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

describe("saving a scanned receipt", () => {
  it("stores what was read alongside the expense the user confirmed", async () => {
    expect(await createExpense(scanned)).toEqual({ ok: true });

    const [receipt] = await rows(
      "select id, user_id, merchant, purchased_on::text, subtotal_cents, tax_cents, total_cents, image_pathname from receipts",
    );
    expect(receipt).toMatchObject({
      user_id: "user_a",
      merchant: "Costco Wholesale",
      purchased_on: "2026-10-05",
      subtotal_cents: 10_000,
      tax_cents: 1_300,
      total_cents: 11_300,
      image_pathname: OWN_PHOTO,
    });
    const [expense] = await rows(
      "select description, amount_cents, receipt_id from expenses",
    );
    expect(expense).toEqual({
      description: "Costco",
      amount_cents: 11_300,
      receipt_id: receipt?.id,
    });
  });

  it("treats unreadable receipt values as blank instead of failing the save", async () => {
    expect(
      await createExpense({
        ...scanned,
        receiptSubtotal: "n/a",
        receiptPurchasedOn: "yesterday",
        receiptMerchant: "   ",
      }),
    ).toEqual({ ok: true });
    const [receipt] = await rows(
      "select merchant, purchased_on, subtotal_cents from receipts",
    );
    expect(receipt).toEqual({
      merchant: null,
      purchased_on: null,
      subtotal_cents: null,
    });
  });

  it("refuses a photo from someone else's folder", async () => {
    const result = await createExpense({
      ...scanned,
      receiptImage: OWN_PHOTO.replace("user_a", "user_b"),
    });
    expect(result).toEqual({
      ok: false,
      error: "That receipt photo couldn't be attached. Scan it again.",
    });
    expect(await rows("select id from expenses")).toEqual([]);
    expect(await rows("select id from receipts")).toEqual([]);
  });

  it("refuses a pathname that tries to walk out of the folder", async () => {
    const result = await createExpense({
      ...scanned,
      receiptImage: "receipts/user_a/../user_b/x.jpg",
    });
    expect(result.ok).toBe(false);
  });

  it("removes the photo when the expense is deleted", async () => {
    await createExpense(scanned);
    const [expense] = await rows("select id from expenses");
    expect(await deleteExpense(expense?.id as string)).toEqual({ ok: true });
    expect(deleteReceiptImage).toHaveBeenCalledWith(OWN_PHOTO);
    expect(await rows("select id from receipts")).toEqual([]);
  });

  it("does not touch photo storage for an expense without a receipt", async () => {
    await createExpense({
      description: "Gas",
      category: "Transportation",
      amount: "60",
      spentOn: "2026-10-06",
    });
    const [expense] = await rows("select id from expenses");
    await deleteExpense(expense?.id as string);
    expect(deleteReceiptImage).not.toHaveBeenCalled();
  });

  it("saves a split receipt as one expense per category", async () => {
    expect(
      await createExpense({
        ...scanned,
        category: "Groceries",
        splits: JSON.stringify([
          { category: "Groceries", amount: "80.00" },
          { category: "Alcohol", amount: "33.00" },
        ]),
      }),
    ).toEqual({ ok: true });

    const saved = await rows(
      "select description, category, amount_cents, receipt_id from expenses order by amount_cents desc",
    );
    const [receipt] = await rows("select id from receipts");
    expect(saved).toEqual([
      {
        description: "Costco",
        category: "Groceries",
        amount_cents: 8_000,
        receipt_id: receipt?.id,
      },
      {
        description: "Costco",
        category: "Alcohol",
        amount_cents: 3_300,
        receipt_id: receipt?.id,
      },
    ]);
  });

  it("refuses a split that doesn't match the total", async () => {
    const result = await createExpense({
      ...scanned,
      splits: JSON.stringify([
        { category: "Groceries", amount: "80.00" },
        { category: "Alcohol", amount: "30.00" },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        splits: ["The parts add up to $110.00 but the total is $113.00"],
      },
    });
    expect(await rows("select id from expenses")).toEqual([]);
    expect(await rows("select id from receipts")).toEqual([]);
  });

  it("only removes a split receipt's photo with its last part", async () => {
    await createExpense({
      ...scanned,
      splits: JSON.stringify([
        { category: "Groceries", amount: "80.00" },
        { category: "Alcohol", amount: "33.00" },
      ]),
    });
    const [first, second] = await rows("select id from expenses");
    await deleteExpense(first?.id as string);
    expect(deleteReceiptImage).not.toHaveBeenCalled();
    await deleteExpense(second?.id as string);
    expect(deleteReceiptImage).toHaveBeenCalledWith(OWN_PHOTO);
  });
});
