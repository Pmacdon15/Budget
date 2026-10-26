import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBankBalance } from "@/actions/bank-balance";
import { createExpense } from "@/actions/expenses";
import { approvePendingExpense } from "@/actions/pending-expenses";
import { getBankBalance } from "@/dal/bank-balance";
import { insertFixedItem } from "@/db/fixed-items";
import { selectPhotosInUse } from "@/db/receipt-cleanup";
import { deleteReceiptImage, putReceiptImage } from "@/lib/receipt-store";
import {
  addExpense,
  addFixedBill,
  attachReceipt,
  editFixedBill,
  listFixedBills,
  type McpCaller,
  markBillPaid,
  markExpensePaid,
  syncBankBalance,
} from "@/mcp/tools";
import { rows } from "../../helpers/test-db";

/*
 * The MCP tools for unpaid expenses, receipts from email and fixed bills,
 * against the real schema. Photos go to a mocked private store.
 */

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Muse" };

const order = {
  amount: 250,
  date: "2026-10-25",
  merchant: "Natures Garden",
  category: "Personal",
  source: "Ngyyc@naturesgardenyyc.ca: Order 3242",
};

/** A tiny JPEG: just the FF D8 FF start marker and some bytes. */
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString(
  "base64",
);
const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString(
  "base64",
);

/** Enters a balance and marks it as set on Oct 1, before everything below. */
async function balanceOnOct1(balance: string) {
  await setBankBalance({ balance });
  await rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");
}

async function approveOnly() {
  const [row] = await rows("select id from pending_expenses");
  expect(await approvePendingExpense(String(row?.id))).toEqual({ ok: true });
  const [expense] = await rows("select id from expenses");
  return String(expense?.id);
}

beforeEach(() => {
  vi.mocked(putReceiptImage).mockClear();
  vi.mocked(deleteReceiptImage).mockClear();
});

describe("unpaid expenses", () => {
  it("stay off the bank balance until marked paid", async () => {
    await balanceOnOct1("1000");
    const added = await addExpense(A, { ...order, unpaid: true });
    expect(added.data).toMatchObject({
      status: "pending_review",
      unpaid: true,
    });
    const id = await approveOnly();
    expect(await rows("select unpaid from expenses")).toEqual([
      { unpaid: true },
    ]);
    expect((await getBankBalance())?.balanceCents).toBe(100_000);

    const paid = await markExpensePaid(A, { id, paid_on: "2026-10-27" });
    expect(paid.data).toMatchObject({ kind: "expense", paid_on: "2026-10-27" });
    expect((await getBankBalance())?.balanceCents).toBe(75_000);
  });

  it("can be marked paid while still waiting for review", async () => {
    await balanceOnOct1("1000");
    const { data } = await addExpense(A, { ...order, unpaid: true });
    const paid = await markExpensePaid(A, {
      id: String(data.id),
      paid_on: "2026-10-26",
    });
    expect(paid.data).toMatchObject({ kind: "pending" });
    await approveOnly();
    expect((await getBankBalance())?.balanceCents).toBe(75_000);
  });

  it("don't come off a balance synced after they were paid", async () => {
    await addExpense(A, { ...order, unpaid: true });
    const id = await approveOnly();
    await markExpensePaid(A, { id, paid_on: "2026-10-25" });
    await rows("update expenses set paid_at = now() - interval '1 minute'");
    // The bank's alert afterwards already includes the payment.
    await syncBankBalance(A, { balance: 500 });
    expect((await getBankBalance())?.balanceCents).toBe(50_000);
  });

  it("say so when the expense was never unpaid", async () => {
    await createExpense({
      description: "Shell",
      category: "Transportation",
      amount: "40",
      spentOn: "2026-10-20",
    });
    const [row] = await rows("select id from expenses");
    const result = await markExpensePaid(A, {
      id: String(row?.id),
      paid_on: "2026-10-20",
    });
    expect(result.summary).toContain("wasn't marked unpaid");
    expect(result.isError).toBeUndefined();
  });

  it("can't be marked paid by another user", async () => {
    const { data } = await addExpense(A, { ...order, unpaid: true });
    const result = await markExpensePaid(B, {
      id: String(data.id),
      paid_on: "2026-10-26",
    });
    expect(result.isError).toBe(true);
    expect(await rows("select unpaid from pending_expenses")).toEqual([
      { unpaid: true },
    ]);
  });
});

describe("receipts from email", () => {
  it("saves a receipt's details with the expense when it's approved", async () => {
    await addExpense(A, {
      ...order,
      merchant: "Anthropic",
      amount: 21,
      receipt: {
        merchant: "Anthropic, PBC",
        purchased_on: "2026-10-05",
        subtotal: 20,
        tax: 1,
        total: 21,
        text: "One-time credit purchase $20.00, GST $1.00",
      },
    });
    expect(putReceiptImage).not.toHaveBeenCalled();
    await approveOnly();
    expect(
      await rows(
        "select r.merchant, r.purchased_on::text as purchased_on, r.subtotal_cents, r.tax_cents, r.total_cents, r.raw_text, r.image_pathname from expenses e join receipts r on r.id = e.receipt_id",
      ),
    ).toEqual([
      {
        merchant: "Anthropic, PBC",
        purchased_on: "2026-10-05",
        subtotal_cents: 2_000,
        tax_cents: 100,
        total_cents: 2_100,
        raw_text: "One-time credit purchase $20.00, GST $1.00",
        image_pathname: null,
      },
    ]);
  });

  it("stores a JPEG in the caller's own folder and links it on approval", async () => {
    await addExpense(A, {
      ...order,
      receipt: { total: 250, image_jpeg_base64: JPEG_BASE64 },
    });
    const [pathname] = vi.mocked(putReceiptImage).mock.calls[0] ?? [];
    expect(pathname).toMatch(/^receipts\/user_a\/[0-9a-f-]{36}\.jpg$/);
    // Waiting for review, the photo counts as in use, so cleanup keeps it.
    expect(await selectPhotosInUse([String(pathname)], 10)).toEqual(
      new Set([pathname]),
    );
    await approveOnly();
    expect(
      await rows(
        "select r.image_pathname from expenses e join receipts r on r.id = e.receipt_id",
      ),
    ).toEqual([{ image_pathname: pathname }]);
  });

  it("refuses an image that isn't a JPEG, saving nothing", async () => {
    const result = await addExpense(A, {
      ...order,
      receipt: { total: 250, image_jpeg_base64: PNG_BASE64 },
    });
    expect(result.isError).toBe(true);
    expect(result.summary).toContain("isn't a JPEG");
    expect(putReceiptImage).not.toHaveBeenCalled();
    expect(await rows("select * from pending_expenses")).toHaveLength(0);
  });

  it("refuses an empty receipt", async () => {
    const result = await addExpense(A, { ...order, receipt: {} });
    expect(result.isError).toBe(true);
    expect(await rows("select * from pending_expenses")).toHaveLength(0);
  });

  it("attaches a receipt to a saved expense, then replaces it", async () => {
    await createExpense({
      description: "AWS",
      category: "Subscriptions",
      amount: "11.85",
      spentOn: "2026-10-01",
    });
    const [row] = await rows("select id from expenses");
    const id = String(row?.id);

    const first = await attachReceipt(A, {
      expense_id: id,
      total: 11.85,
      image_jpeg_base64: JPEG_BASE64,
    });
    expect(first.data).toMatchObject({ kind: "expense", has_photo: true });
    const [firstPhoto] = vi.mocked(putReceiptImage).mock.calls[0] ?? [];

    const second = await attachReceipt(A, {
      expense_id: id,
      total: 11.85,
      text: "AWS September statement",
      image_jpeg_base64: JPEG_BASE64,
    });
    expect(second.data).toMatchObject({ replaced_photo: true });
    expect(deleteReceiptImage).toHaveBeenCalledWith(firstPhoto);
    expect(await rows("select raw_text from receipts")).toEqual([
      { raw_text: "AWS September statement" },
    ]);
  });

  it("attaches a receipt to an item waiting for review", async () => {
    const { data } = await addExpense(A, order);
    const result = await attachReceipt(A, {
      pending_id: String(data.id),
      total: 250,
    });
    expect(result.data).toMatchObject({ kind: "pending", has_photo: false });
    expect(
      await rows(
        "select receipt->>'total_cents' as total from pending_expenses",
      ),
    ).toEqual([{ total: "25000" }]);
  });

  it("needs exactly one target", async () => {
    await expect(attachReceipt(A, { total: 1 })).rejects.toThrow();
  });

  it("can't attach to another user's expense, and stores no photo", async () => {
    await createExpense({
      description: "Mine",
      category: "Other",
      amount: "5",
      spentOn: "2026-10-01",
    });
    const [row] = await rows("select id from expenses");
    const result = await attachReceipt(B, {
      expense_id: String(row?.id),
      image_jpeg_base64: JPEG_BASE64,
    });
    expect(result.isError).toBe(true);
    expect(putReceiptImage).not.toHaveBeenCalled();
    expect(await rows("select * from receipts")).toHaveLength(0);
  });
});

describe("fixed bills", () => {
  const internet = () =>
    insertFixedItem("user_a", {
      name: "Internet",
      category: "Utilities",
      amountCents: 8_500,
      dueDay: 12,
      startMonth: "2026-01",
    });

  it("lists the month's bills with whether each is paid", async () => {
    const id = await internet();
    await markBillPaid(A, { id, month: "2026-10" });
    const result = await listFixedBills(A, { month: "2026-10" });
    expect(result.data.bills).toEqual([
      {
        id,
        name: "Internet",
        category: "Utilities",
        amount: 85,
        is_estimate: false,
        frequency: "monthly",
        due_day: 12,
        merchant: null,
        match_keywords: [],
        start_month: "2026-01",
        end_month: null,
        paid_this_month: true,
        // Marked paid without a date, so there's no charge to show yet.
        last_charged_on: null,
        last_charged_amount: null,
        amount_history: [
          {
            from_month: "2026-01",
            to_month: null,
            amount: 85,
            is_estimate: false,
          },
        ],
      },
    ]);
    expect((await listFixedBills(A, { month: "2025-12" })).data.bills).toEqual(
      [],
    );
    expect((await listFixedBills(B, { month: "2026-10" })).data.bills).toEqual(
      [],
    );
  });

  it("adds a bill from a month", async () => {
    const result = await addFixedBill(A, {
      name: "Google AI Pro",
      category: "Subscriptions",
      amount: 28.34,
      due_day: 17,
      start_month: "2026-10",
    });
    expect(result.data).toMatchObject({ start_month: "2026-10" });
    expect(
      await rows(
        "select user_id, name, amount_cents, due_day, start_month, end_month from fixed_items",
      ),
    ).toEqual([
      {
        user_id: "user_a",
        name: "Google AI Pro",
        amount_cents: 2_834,
        due_day: 17,
        start_month: "2026-10",
        end_month: null,
      },
    ]);
  });

  it("changes a price from a month on, keeping earlier months", async () => {
    const id = await internet();
    const result = await editFixedBill(A, {
      id,
      from_month: "2026-11",
      amount: 95,
    });
    expect(result.summary).toContain("$85.00 → $95.00");
    expect(
      await rows(
        "select amount_cents, start_month, end_month from fixed_items order by start_month",
      ),
    ).toEqual([
      { amount_cents: 8_500, start_month: "2026-01", end_month: "2026-10" },
      { amount_cents: 9_500, start_month: "2026-11", end_month: null },
    ]);
  });

  it("won't edit a month the bill doesn't run in", async () => {
    const id = await internet();
    const result = await editFixedBill(A, {
      id,
      from_month: "2025-06",
      amount: 95,
    });
    expect(result.isError).toBe(true);
    expect(await rows("select amount_cents from fixed_items")).toEqual([
      { amount_cents: 8_500 },
    ]);
  });

  it("can't edit or mark paid another user's bill", async () => {
    const id = await internet();
    expect(
      (await editFixedBill(B, { id, from_month: "2026-11", amount: 1 }))
        .isError,
    ).toBe(true);
    expect((await markBillPaid(B, { id, month: "2026-10" })).isError).toBe(
      true,
    );
    expect(await rows("select * from fixed_item_payments")).toHaveLength(0);
    expect(await rows("select amount_cents from fixed_items")).toEqual([
      { amount_cents: 8_500 },
    ]);
  });

  it("only marks a bill paid in a month it runs in", async () => {
    const id = await internet();
    expect((await markBillPaid(A, { id, month: "2025-12" })).isError).toBe(
      true,
    );
    expect(
      (await markBillPaid(A, { id, month: "2026-10" })).data,
    ).toMatchObject({ paid: true });
    // Marking twice is fine.
    await markBillPaid(A, { id, month: "2026-10" });
    expect(await rows("select month from fixed_item_payments")).toEqual([
      { month: "2026-10" },
    ]);
  });
});
