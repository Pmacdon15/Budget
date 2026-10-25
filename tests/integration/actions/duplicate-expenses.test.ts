import { describe, expect, it, vi } from "vitest";
import { checkDuplicateExpense } from "@/actions/duplicate-expenses";
import { createExpense } from "@/actions/expenses";
import type { ExpenseFormValues } from "@/lib/schemas";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const PHOTO = (user: string, n: number) =>
  `receipts/${user}/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6${n}.jpg`;

const manual: ExpenseFormValues = {
  description: "Costco run",
  category: "Groceries",
  amount: "84.20",
  spentOn: "2026-10-05",
};

const scanned: ExpenseFormValues = {
  description: "Costco",
  category: "Groceries",
  amount: "113.00",
  spentOn: "2026-10-05",
  receiptImage: PHOTO("user_a", 1),
  receiptMerchant: "Costco Wholesale",
  receiptTotal: "113.00",
};

describe("checkDuplicateExpense", () => {
  it("finds a saved expense with the same date, total and description", async () => {
    await createExpense(manual);
    expect(
      await checkDuplicateExpense({ ...manual, description: "  COSTCO RUN " }),
    ).toEqual({
      description: "Costco run",
      spentOn: "2026-10-05",
      amountCents: 8_420,
      scanned: false,
    });
  });

  it("answers null when the date, total or description differ", async () => {
    await createExpense(manual);
    expect(
      await checkDuplicateExpense({ ...manual, spentOn: "2026-10-06" }),
    ).toBeNull();
    expect(await checkDuplicateExpense({ ...manual, amount: "84.21" })).toBe(
      null,
    );
    expect(
      await checkDuplicateExpense({ ...manual, description: "Gas" }),
    ).toBeNull();
  });

  it("catches a receipt scanned twice by its merchant, even renamed", async () => {
    await createExpense(scanned);
    expect(
      await checkDuplicateExpense({
        ...scanned,
        description: "Big shop",
        receiptImage: PHOTO("user_a", 2),
      }),
    ).toMatchObject({ description: "Costco", scanned: true });
  });

  it("adds up the parts of a split receipt", async () => {
    await createExpense({
      ...scanned,
      splits: JSON.stringify([
        { category: "Groceries", amount: "80.00" },
        { category: "Alcohol", amount: "33.00" },
      ]),
    });
    expect(await rows("select id from expenses")).toHaveLength(2);
    expect(
      await checkDuplicateExpense({
        ...scanned,
        receiptImage: PHOTO("user_a", 2),
      }),
    ).toMatchObject({ amountCents: 11_300, scanned: true });
    // One part alone is not the same receipt.
    expect(
      await checkDuplicateExpense({
        ...manual,
        description: "Costco",
        amount: "80.00",
      }),
    ).toBeNull();
  });

  it("only looks at the signed-in user's expenses", async () => {
    await createExpense(manual);
    signInAs("user_b");
    expect(await checkDuplicateExpense(manual)).toBeNull();
  });

  it("never blocks: signed out or invalid values answer null", async () => {
    await createExpense(manual);
    expect(await checkDuplicateExpense({ ...manual, amount: "lots" })).toBe(
      null,
    );
    signOut();
    expect(await checkDuplicateExpense(manual)).toBeNull();
  });

  it("saves nothing itself, and the duplicate can still be added", async () => {
    await createExpense(manual);
    await checkDuplicateExpense(manual);
    expect(await rows("select id from expenses")).toHaveLength(1);
    expect(await createExpense(manual)).toEqual({ ok: true });
    expect(await rows("select id from expenses")).toHaveLength(2);
  });
});
