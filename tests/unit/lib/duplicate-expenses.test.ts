import { describe, expect, it } from "vitest";
import { duplicateKey, duplicateWarning } from "@/lib/duplicate-expenses";
import type { ExpenseFormValues } from "@/lib/schemas";

describe("duplicateWarning", () => {
  it("names the saved expense, its amount and its date", () => {
    expect(
      duplicateWarning({
        description: "Costco",
        spentOn: "2026-10-05",
        amountCents: 11_300,
        scanned: true,
      }),
    ).toBe(
      "This looks like a scanned receipt you already saved: Costco, $113.00 on Oct 5, 2026. Save anyway to add it again.",
    );
  });

  it("says expense for one typed in by hand", () => {
    expect(
      duplicateWarning({
        description: "Gas",
        spentOn: "2026-01-31",
        amountCents: 6_000,
        scanned: false,
      }),
    ).toContain("an expense you already saved: Gas, $60.00 on Jan 31, 2026");
  });
});

describe("duplicateKey", () => {
  const values: ExpenseFormValues = {
    description: "Costco",
    category: "Groceries",
    amount: "113.00",
    spentOn: "2026-10-05",
  };

  it("ignores case, spacing and the category", () => {
    expect(
      duplicateKey({ ...values, description: " COSTCO ", category: "Dining" }),
    ).toBe(duplicateKey(values));
  });

  it("changes when the description, amount, date or merchant do", () => {
    const key = duplicateKey(values);
    expect(duplicateKey({ ...values, description: "Gas" })).not.toBe(key);
    expect(duplicateKey({ ...values, amount: "113.01" })).not.toBe(key);
    expect(duplicateKey({ ...values, spentOn: "2026-10-06" })).not.toBe(key);
    expect(duplicateKey({ ...values, receiptMerchant: "Costco" })).not.toBe(
      key,
    );
  });
});
