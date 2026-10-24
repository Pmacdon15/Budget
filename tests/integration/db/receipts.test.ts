import { describe, expect, it } from "vitest";
import {
  deleteExpenseRow,
  insertExpense,
  insertExpenseWithReceipt,
  selectExpensesBetween,
  selectExpensesForExport,
  selectReceiptImage,
  updateExpenseRow,
} from "@/db/expenses";
import { rows } from "../../helpers/test-db";

const values = {
  month: "2026-10",
  spentOn: "2026-10-05",
  description: "Costco",
  category: "Groceries",
  amountCents: 11_300,
};

const receipt = {
  imagePathname: "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg",
  merchant: "Costco Wholesale",
  purchasedOn: "2026-10-05",
  subtotalCents: 10_000,
  taxCents: 1_300,
  totalCents: 11_300,
  rawText: "COSTCO\nTOTAL 113.00",
};

describe("db/expenses with receipts", () => {
  it("saves the receipt and links it to the expense", async () => {
    await insertExpenseWithReceipt("user_a", values, receipt);

    const [expense] = await selectExpensesBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );
    expect(expense?.receiptId).toEqual(expect.any(String));

    const [stored] = await rows(
      "select user_id, merchant, subtotal_cents, tax_cents, total_cents, raw_text, image_pathname from receipts",
    );
    expect(stored).toEqual({
      user_id: "user_a",
      merchant: "Costco Wholesale",
      subtotal_cents: 10_000,
      tax_cents: 1_300,
      total_cents: 11_300,
      raw_text: "COSTCO\nTOTAL 113.00",
      image_pathname: receipt.imagePathname,
    });
  });

  it("keeps the receipt link when the expense is edited", async () => {
    await insertExpenseWithReceipt("user_a", values, receipt);
    const [before] = await selectExpensesBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );
    await updateExpenseRow("user_a", before?.id as string, {
      ...values,
      description: "Costco run",
    });
    const [after] = await selectExpensesBetween("user_a", "2026-10", "2026-10");
    expect(after?.description).toBe("Costco run");
    expect(after?.receiptId).toBe(before?.receiptId);
  });

  it("returns a receipt's photo only to its owner", async () => {
    await insertExpenseWithReceipt("user_a", values, receipt);
    const [expense] = await selectExpensesBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );
    const id = expense?.receiptId as string;

    expect(await selectReceiptImage("user_a", id)).toBe(receipt.imagePathname);
    expect(await selectReceiptImage("user_b", id)).toBeNull();
  });

  it("deletes the receipt with its expense and hands back the photo", async () => {
    await insertExpenseWithReceipt("user_a", values, receipt);
    const [expense] = await selectExpensesBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );
    const id = expense?.id as string;

    expect(await deleteExpenseRow("user_b", id)).toBeNull();
    expect(await rows("select id from receipts")).toHaveLength(1);

    expect(await deleteExpenseRow("user_a", id)).toEqual({
      imagePathname: receipt.imagePathname,
    });
    expect(await rows("select id from expenses")).toEqual([]);
    expect(await rows("select id from receipts")).toEqual([]);
  });

  describe("selectExpensesForExport", () => {
    it("filters by months and categories, oldest first, with receipt details", async () => {
      await insertExpense("user_a", {
        ...values,
        spentOn: "2026-10-20",
        description: "Dinner",
        category: "Dining",
        amountCents: 5_000,
      });
      await insertExpenseWithReceipt("user_a", values, receipt);
      await insertExpense("user_a", {
        ...values,
        description: "Movie",
        category: "Entertainment",
      });
      await insertExpense("user_a", {
        ...values,
        month: "2026-08",
        spentOn: "2026-08-01",
        description: "Too early",
      });
      await insertExpense("user_b", values);

      const found = await selectExpensesForExport(
        "user_a",
        "2026-09",
        "2026-10",
        ["Groceries", "Dining"],
      );
      expect(found).toEqual([
        {
          id: expect.any(String),
          ...values,
          receiptId: expect.any(String),
          merchant: "Costco Wholesale",
          subtotalCents: 10_000,
          taxCents: 1_300,
          imagePathname: receipt.imagePathname,
        },
        {
          id: expect.any(String),
          ...values,
          spentOn: "2026-10-20",
          description: "Dinner",
          category: "Dining",
          amountCents: 5_000,
          receiptId: null,
          merchant: null,
          subtotalCents: null,
          taxCents: null,
          imagePathname: null,
        },
      ]);
    });
  });
});
