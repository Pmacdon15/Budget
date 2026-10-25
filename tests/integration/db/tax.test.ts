import { describe, expect, it } from "vitest";
import {
  insertExpense,
  insertExpenseLines,
  type ReceiptValues,
} from "@/db/expenses";
import { selectReceiptTaxByMonth } from "@/db/tax";

const receipt = (taxCents: number | null): ReceiptValues => ({
  imagePathname: `receipts/user_a/${crypto.randomUUID()}.jpg`,
  merchant: "Costco Wholesale",
  purchasedOn: null,
  subtotalCents: 10_000,
  taxCents,
  totalCents: 11_300,
  rawText: null,
});

async function scan(
  userId: string,
  month: string,
  taxCents: number | null,
  categories = ["Groceries"],
) {
  await insertExpenseLines(
    userId,
    { month, spentOn: `${month}-05`, description: "Costco" },
    categories.map((category) => ({ category, amountCents: 5_000 })),
    receipt(taxCents),
  );
}

describe("db/tax", () => {
  it("sums tax per month across the range", async () => {
    await scan("user_a", "2026-03", 500);
    await scan("user_a", "2026-10", 1_300);
    await scan("user_a", "2026-10", 200);

    expect(
      await selectReceiptTaxByMonth("user_a", "2026-01", "2026-12"),
    ).toEqual([
      { month: "2026-03", taxCents: 500, receipts: 1 },
      { month: "2026-10", taxCents: 1_500, receipts: 2 },
    ]);
  });

  it("counts a receipt split across categories once", async () => {
    await scan("user_a", "2026-10", 1_300, ["Groceries", "Dining"]);
    expect(
      await selectReceiptTaxByMonth("user_a", "2026-10", "2026-10"),
    ).toEqual([{ month: "2026-10", taxCents: 1_300, receipts: 1 }]);
  });

  it("only counts the user's own receipts", async () => {
    await scan("user_a", "2026-10", 1_300);
    await scan("user_b", "2026-10", 9_900);
    expect(
      await selectReceiptTaxByMonth("user_b", "2026-01", "2026-12"),
    ).toEqual([{ month: "2026-10", taxCents: 9_900, receipts: 1 }]);
    expect(
      await selectReceiptTaxByMonth("user_c", "2026-01", "2026-12"),
    ).toEqual([]);
  });

  it("skips receipts without a tax amount and expenses without receipts", async () => {
    await scan("user_a", "2026-10", null);
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-02",
      description: "Coffee",
      category: "Dining",
      amountCents: 500,
    });
    expect(
      await selectReceiptTaxByMonth("user_a", "2026-01", "2026-12"),
    ).toEqual([]);
  });

  it("leaves out months outside the range", async () => {
    await scan("user_a", "2025-12", 700);
    await scan("user_a", "2026-01", 300);
    expect(
      await selectReceiptTaxByMonth("user_a", "2026-01", "2026-12"),
    ).toEqual([{ month: "2026-01", taxCents: 300, receipts: 1 }]);
  });
});
