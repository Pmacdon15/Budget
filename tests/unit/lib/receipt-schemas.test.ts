import { describe, expect, it } from "vitest";
import { CATEGORY_NAMES } from "@/lib/categories";
import { expenseExportSchema, expenseWithReceiptSchema } from "@/lib/schemas";

describe("expenseWithReceiptSchema", () => {
  const expense = {
    description: "Costco",
    category: "Groceries",
    amount: "113.00",
    spentOn: "2026-10-05",
  };

  it("is a plain expense when nothing was scanned", () => {
    expect(expenseWithReceiptSchema.parse(expense)).toEqual({
      description: "Costco",
      category: "Groceries",
      amount: 11_300,
      spentOn: "2026-10-05",
      receiptImage: null,
      receiptMerchant: null,
      receiptPurchasedOn: null,
      receiptSubtotal: null,
      receiptTax: null,
      receiptTotal: null,
      receiptText: null,
    });
  });

  it("parses scanned values leniently", () => {
    expect(
      expenseWithReceiptSchema.parse({
        ...expense,
        receiptImage: "receipts/u/x.jpg",
        receiptMerchant: " Costco ",
        receiptPurchasedOn: "garbage",
        receiptSubtotal: "100.00",
        receiptTax: "oops",
        receiptTotal: "",
        receiptText: "x".repeat(5000),
      }),
    ).toMatchObject({
      receiptImage: "receipts/u/x.jpg",
      receiptMerchant: "Costco",
      receiptPurchasedOn: null,
      receiptSubtotal: 10_000,
      receiptTax: null,
      receiptTotal: null,
      receiptText: "x".repeat(4000),
    });
  });

  it("still validates the expense itself", () => {
    expect(
      expenseWithReceiptSchema.safeParse({ ...expense, amount: "abc" }).success,
    ).toBe(false);
  });
});

describe("expenseExportSchema", () => {
  const valid = {
    format: "pdf",
    from: "2026-01",
    to: "2026-10",
    categories: ["Dining", "Dining", "Groceries"],
  };

  it("accepts a range and de-duplicates categories", () => {
    expect(expenseExportSchema.parse(valid)).toEqual({
      format: "pdf",
      from: "2026-01",
      to: "2026-10",
      categories: ["Dining", "Groceries"],
      photos: false,
    });
  });

  it("allows every category at once", () => {
    expect(
      expenseExportSchema.safeParse({
        ...valid,
        categories: [...CATEGORY_NAMES],
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ format: "docx" }, "Pick a file type"],
    [{ categories: [] }, "Pick at least one category"],
    [{ categories: ["Yachts"] }, "Pick a category"],
    [{ from: "2026-13" }, "Pick a month"],
    [
      { from: "2026-11", to: "2026-10" },
      "The start month must come before the end month",
    ],
  ])("rejects %o", (change, message) => {
    const result = expenseExportSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
