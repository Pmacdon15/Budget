import { describe, expect, it } from "vitest";
import { createExpense } from "@/actions/expenses";
import { insertFixedItem } from "@/db/fixed-items";
import {
  convertExpenseToFixedBill,
  type McpCaller,
  markBillPaid,
} from "@/mcp/tools";
import { rows } from "../../helpers/test-db";

/*
 * convert_expense_to_fixed_bill and mark_bill_paid with expense_id share their
 * conversion with the Spending page's "Make fixed bill" (src/dal/expense-bills.ts).
 */

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Claude" };

async function saveExpense(
  description: string,
  spentOn: string,
  amount: string,
) {
  await createExpense({
    description,
    category: "Entertainment",
    amount,
    spentOn,
  });
  const [row] = await rows(
    "select id from expenses where description = $1 and spent_on = $2",
    [description, spentOn],
  );
  return String(row?.id);
}

const netflixBill = (amountCents = 1_599) =>
  insertFixedItem("user_a", {
    name: "Netflix",
    category: "Subscriptions",
    amountCents,
    dueDay: 5,
    startMonth: "2026-01",
  });

describe("convert_expense_to_fixed_bill", () => {
  it("makes a saved expense a bill, with it as the first paid month", async () => {
    const id = await saveExpense("Netflix", "2026-10-07", "16.99");
    const result = await convertExpenseToFixedBill(A, {
      expense_id: id,
      category: "Subscriptions",
      merchant: "Netflix.com",
    });
    expect(result.isError).toBeUndefined();
    expect(result.data).toMatchObject({
      name: "Netflix",
      amount: 16.99,
      start_month: "2026-10",
      expense_id: id,
    });
    expect(
      await rows(
        "select name, category, amount_cents, due_day, merchant, match_keywords from fixed_items",
      ),
    ).toEqual([
      {
        name: "Netflix",
        category: "Subscriptions",
        amount_cents: 1_699,
        due_day: 7,
        merchant: "Netflix.com",
        match_keywords: ["Netflix.com"],
      },
    ]);
    const [expense] = await rows("select fixed_item_id from expenses");
    expect(expense?.fixed_item_id).toBe(result.data.fixed_bill_id);
  });

  it("won't convert an expense twice, or another user's", async () => {
    const id = await saveExpense("Netflix", "2026-10-07", "16.99");
    expect(
      (await convertExpenseToFixedBill(B, { expense_id: id })).isError,
    ).toBe(true);
    await convertExpenseToFixedBill(A, { expense_id: id });
    expect(
      (await convertExpenseToFixedBill(A, { expense_id: id })).isError,
    ).toBe(true);
    expect(await rows("select id from fixed_items")).toHaveLength(1);
  });
});

describe("mark_bill_paid with expense_id", () => {
  it("links the expense and, when asked, takes its amount", async () => {
    const billId = await netflixBill();
    const id = await saveExpense("Netflix.com", "2026-10-05", "16.99");
    const result = await markBillPaid(A, {
      id: billId,
      month: "2026-10",
      expense_id: id,
      update_amount: true,
    });
    expect(result.isError).toBeUndefined();
    expect(result.data).toMatchObject({ paid: true, amount: 16.99 });
    expect(
      await rows(
        "select amount_cents, end_month from fixed_items order by start_month",
      ),
    ).toEqual([
      { amount_cents: 1_599, end_month: "2026-09" },
      { amount_cents: 1_699, end_month: null },
    ]);
  });

  it("refuses a month another expense already paid", async () => {
    const billId = await netflixBill();
    const first = await saveExpense("Netflix", "2026-10-05", "15.99");
    const second = await saveExpense("Netflix", "2026-10-21", "15.99");
    await markBillPaid(A, { id: billId, month: "2026-10", expense_id: first });
    const result = await markBillPaid(A, {
      id: billId,
      month: "2026-10",
      expense_id: second,
    });
    expect(result.isError).toBe(true);
    expect(result.summary).toContain("already paid for 2026-10");
    const [row] = await rows(
      "select fixed_item_id from expenses where id = $1",
      [second],
    );
    expect(row?.fixed_item_id).toBeNull();
  });
});
