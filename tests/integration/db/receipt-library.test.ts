import { describe, expect, it } from "vitest";
import {
  insertExpense,
  insertExpenseLines,
  type ReceiptValues,
} from "@/db/expenses";
import { selectReceiptLibrary } from "@/db/receipt-library";
import { rows } from "../../helpers/test-db";

const receipt = (
  overrides: Partial<ReceiptValues> = {},
  userId = "user_a",
): ReceiptValues => ({
  imagePathname: `receipts/${userId}/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg`,
  merchant: "Costco Wholesale",
  purchasedOn: "2026-10-05",
  subtotalCents: 10_000,
  taxCents: 1_300,
  totalCents: 11_300,
  rawText: "COSTCO\nTOTAL 113.00",
  ...overrides,
});

async function scan(
  spentOn: string,
  description: string,
  overrides: Partial<ReceiptValues> = {},
  userId = "user_a",
  lines = [{ category: "Groceries", amountCents: 11_300 }],
) {
  await insertExpenseLines(
    userId,
    { month: spentOn.slice(0, 7), spentOn, description },
    lines,
    receipt({ purchasedOn: spentOn, ...overrides }, userId),
  );
}

describe("selectReceiptLibrary", () => {
  it("lists only this user's receipts, newest first", async () => {
    await scan("2026-08-14", "Hardware", { merchant: "Home Depot" });
    await scan("2026-10-05", "Groceries");
    await scan("2026-09-01", "Theirs", { merchant: "Other" }, "user_b");
    // A plain expense with no receipt isn't in the library.
    await insertExpense("user_a", {
      month: "2026-10",
      spentOn: "2026-10-06",
      description: "Coffee",
      category: "Dining",
      amountCents: 500,
    });

    const list = await selectReceiptLibrary("user_a", "", 50);
    expect(list.map((r) => r.merchant)).toEqual([
      "Costco Wholesale",
      "Home Depot",
    ]);
    expect(list[0]).toMatchObject({
      date: "2026-10-05",
      month: "2026-10",
      totalCents: 11_300,
      taxCents: 1_300,
      descriptions: ["Groceries"],
      categories: ["Groceries"],
      hasPhoto: true,
    });
    expect(await selectReceiptLibrary("user_b", "", 50)).toHaveLength(1);
  });

  it("shows a split receipt once, with every category", async () => {
    await scan("2026-10-05", "Costco run", {}, "user_a", [
      { category: "Groceries", amountCents: 8_000 },
      { category: "Household", amountCents: 3_300 },
    ]);

    const list = await selectReceiptLibrary("user_a", "", 50);
    expect(list).toHaveLength(1);
    expect(list[0]?.categories.sort()).toEqual(["Groceries", "Household"]);
    expect(list[0]?.totalCents).toBe(11_300);
  });

  it("never hands back the photo's pathname", async () => {
    await scan("2026-10-05", "Groceries");
    const [entry] = await selectReceiptLibrary("user_a", "", 50);
    expect(JSON.stringify(entry)).not.toContain("receipts/");
  });

  it("falls back to the expense's date and amount when the reader missed them", async () => {
    await scan("2026-09-20", "Market", {
      merchant: null,
      purchasedOn: null,
      totalCents: null,
      taxCents: null,
    });
    // `scan` sets purchasedOn from the date unless overridden after; clear it.
    await rows("update receipts set purchased_on = null");

    const [entry] = await selectReceiptLibrary("user_a", "", 50);
    expect(entry).toMatchObject({
      merchant: null,
      date: "2026-09-20",
      month: "2026-09",
      totalCents: 11_300,
      taxCents: null,
    });
  });

  it("searches the merchant and descriptions, ignoring case", async () => {
    await scan("2026-10-05", "Weekly shop");
    await scan("2026-08-14", "New drill", { merchant: "Home Depot" });

    const byMerchant = await selectReceiptLibrary("user_a", "costco", 50);
    expect(byMerchant.map((r) => r.merchant)).toEqual(["Costco Wholesale"]);

    const byDescription = await selectReceiptLibrary("user_a", "DRILL", 50);
    expect(byDescription.map((r) => r.merchant)).toEqual(["Home Depot"]);

    expect(await selectReceiptLibrary("user_a", "nothing", 50)).toEqual([]);
  });

  it("takes % and _ in the search literally", async () => {
    await scan("2026-10-05", "Groceries");
    await scan("2026-10-06", "Sale", { merchant: "50% off" });

    const list = await selectReceiptLibrary("user_a", "%", 50);
    expect(list.map((r) => r.merchant)).toEqual(["50% off"]);
    expect(await selectReceiptLibrary("user_a", "_", 50)).toEqual([]);
  });

  it("never matches another user's receipts by search", async () => {
    await scan("2026-10-05", "Groceries", {}, "user_b");
    expect(await selectReceiptLibrary("user_a", "costco", 50)).toEqual([]);
  });

  it("stops at the limit", async () => {
    for (const day of ["01", "02", "03"]) {
      await scan(`2026-10-${day}`, `Shop ${day}`);
    }
    const list = await selectReceiptLibrary("user_a", "", 2);
    expect(list.map((r) => r.date)).toEqual(["2026-10-03", "2026-10-02"]);
  });
});
