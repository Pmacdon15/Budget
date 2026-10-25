import { describe, expect, it, vi } from "vitest";
import { createExpense, updateExpense } from "@/actions/expenses";
import { GET } from "@/app/api/merchant-categories/route";
import type { ExpenseFormValues } from "@/lib/schemas";
import { signInAs, signOut } from "../helpers/auth";
import { rows } from "../helpers/test-db";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const base = { amount: "10.00", spentOn: "2026-10-05" };

async function add(values: Partial<ExpenseFormValues>) {
  const result = await createExpense({
    description: "Costco",
    category: "Groceries",
    ...base,
    ...values,
  } as ExpenseFormValues);
  expect(result).toEqual({ ok: true });
}

/** Spreads saved rows out in time so "newest" doesn't depend on clock ticks. */
async function ageRows() {
  await rows(
    `update expenses set created_at = now() - make_interval(secs => s.n)
     from (select id, row_number() over (order by created_at desc) as n from expenses) s
     where s.id = expenses.id`,
  );
}

async function memory() {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  return (await response.json()).merchants;
}

describe("GET /api/merchant-categories", () => {
  it("refuses signed-out callers with JSON", async () => {
    signOut();
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: "Sign in to see your merchants.",
    });
  });

  it("is empty for a new user", async () => {
    expect(await memory()).toEqual({});
  });

  it("suggests the category picked most recently for a merchant", async () => {
    await add({ category: "Groceries" });
    await add({ description: "Esso #4471", category: "Transportation" });
    await ageRows();
    await add({ description: "COSTCO", category: "Personal" });

    expect(await memory()).toEqual({
      costco: "Personal",
      esso: "Transportation",
    });
  });

  it("follows an edit to the expense's category", async () => {
    await add({ category: "Groceries" });
    const [saved] = await rows("select id from expenses");
    await updateExpense(String(saved?.id), {
      description: "Costco",
      category: "Personal",
      ...base,
    });
    expect(await memory()).toEqual({ costco: "Personal" });
  });

  it("remembers the merchant read off a scanned receipt", async () => {
    await add({
      description: "Big shop",
      receiptImage: "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg",
      receiptMerchant: "Costco Wholesale #55",
    });
    expect(await memory()).toEqual({
      "big shop": "Groceries",
      "costco wholesale": "Groceries",
    });
  });

  it("remembers a split receipt by its largest part", async () => {
    await add({
      amount: "100.00",
      splits: JSON.stringify([
        { category: "Alcohol", amount: "30.00" },
        { category: "Personal", amount: "70.00" },
      ]),
    });
    expect(await memory()).toEqual({ costco: "Personal" });
  });

  it("only uses the signed-in user's own expenses", async () => {
    await add({ category: "Groceries" });
    signInAs("user_b");
    await add({ description: "Esso", category: "Transportation" });

    expect(await memory()).toEqual({ esso: "Transportation" });
    signInAs("user_a");
    expect(await memory()).toEqual({ costco: "Groceries" });
  });
});
