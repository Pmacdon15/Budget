import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvePendingIncome,
  rejectPendingIncome,
} from "@/actions/pending-income";
import { deleteIncomeWithUndo, undoDelete } from "@/actions/undo";
import { getBankBalance } from "@/dal/bank-balance";
import { getReceiptFile } from "@/dal/receipt-files";
import { insertAccount, selectAccounts } from "@/db/accounts";
import { selectIncomeBetween } from "@/db/income";
import { selectPendingIncomeList } from "@/db/pending-income";
import { selectPhotosInUse } from "@/db/receipt-cleanup";
import { selectPendingReceiptFile } from "@/db/receipt-files";
import { selectReceiptLibrary } from "@/db/receipt-library";
import { today } from "@/lib/month";
import { putReceiptFile } from "@/lib/receipt-store";
import { addIncome, listIncome } from "@/mcp/income-tools";
import { addExpense, type McpCaller, syncBankBalance } from "@/mcp/tools";
import { signInAs } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

/*
 * Income the AI finds in email (an e-Transfer someone sent the user): it
 * waits on the Review page, keeps the email as its receipt, and approving it
 * makes it take-home for its month, deposited into chequing. Files go to a
 * mocked private store.
 */

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  putReceiptFile: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Gemini" };

const PDF_BASE64 = Buffer.from("%PDF-1.7\npay stub\n%%EOF\n").toString(
  "base64",
);

const etransferEmail = (amount: string, id = "etransfer-1450") => ({
  message_id: `<${id}@payments.interac.ca>`,
  subject: `Interac e-Transfer: DRIFT LANDSCAPING LTD sent you $${amount}. Claim your deposit!`,
  from: "notify@payments.interac.ca",
  date: "2026-10-14",
  html: `<p>Pat Macdonald, you have $${amount} (CAD) waiting to be deposited!</p><script>steal()</script><img src="https://track.interac.ca/open.gif">`,
});

const payment = {
  amount: 1450,
  date: "2026-10-14",
  payer: "DRIFT LANDSCAPING LTD",
  label: "Drift Landscaping",
  source:
    "notify@payments.interac.ca: DRIFT LANDSCAPING LTD sent you $1,450.00",
  receipt: {
    merchant: "DRIFT LANDSCAPING LTD",
    total: 1450,
    purchased_on: "2026-10-14",
    email: etransferEmail("1,450.00"),
  },
};

async function pendingIdOf(result: { data: Record<string, unknown> }) {
  expect(result.data.status).toBe("pending_review");
  return String(result.data.id);
}

beforeEach(() => {
  vi.mocked(putReceiptFile).mockClear();
  signInAs("user_a");
});

describe("add_income", () => {
  it("sends money received to review, with the email saved as its receipt", async () => {
    const result = await addIncome(A, payment);
    const id = await pendingIdOf(result);
    expect(result.summary).toMatch(/Pending Review/);
    expect(result.data.receipt_kind).toBe("email");

    const [item] = await selectPendingIncomeList("user_a");
    expect(item).toMatchObject({
      id,
      label: "Drift Landscaping",
      payer: "DRIFT LANDSCAPING LTD",
      amountCents: 145_000,
      receivedOn: "2026-10-14",
      client: "Claude",
      hasReceipt: true,
      receiptKind: "email",
    });

    // The email itself is stored, cleaned of scripts and remote images.
    const call = vi.mocked(putReceiptFile).mock.calls.at(-1);
    const stored = await call?.[1].text();
    expect(stored).toContain("waiting to be deposited");
    expect(stored).not.toContain("steal()");
    expect(stored).not.toContain("track.interac.ca");

    // It's served from the pending receipt routes, for its owner only.
    expect(await selectPendingReceiptFile("user_a", id)).toMatchObject({
      kind: "email",
    });
    expect(await selectPendingReceiptFile("user_b", id)).toBeNull();
  });

  it("isn't income until approved: nothing in take-home yet", async () => {
    await addIncome(A, payment);
    expect(await selectIncomeBetween("user_a", "2026-01", "2026-12")).toEqual(
      [],
    );
  });

  it("defaults the label to the payer", async () => {
    await addIncome(A, { ...payment, label: undefined, receipt: undefined });
    const [item] = await selectPendingIncomeList("user_a");
    expect(item?.label).toBe("DRIFT LANDSCAPING LTD");
    expect(item?.hasReceipt).toBe(false);
  });

  it("flags the same amount on the same day without saving", async () => {
    await addIncome(A, payment);
    const again = await addIncome(A, {
      ...payment,
      receipt: {
        ...payment.receipt,
        email: etransferEmail("1,450.00", "deposited-1450"),
      },
    });
    expect(again.data.status).toBe("possible_duplicate");
    expect(again.summary).toMatch(/Nothing was saved/);
    expect(await selectPendingIncomeList("user_a")).toHaveLength(1);

    const separate = await addIncome(A, {
      ...payment,
      allow_duplicate: true,
      receipt: undefined,
    });
    expect(separate.data.status).toBe("pending_review");
    expect(await selectPendingIncomeList("user_a")).toHaveLength(2);
  });

  it("flags the same email again, even on another day or amount", async () => {
    await addIncome(A, payment);
    const resent = await addIncome(A, {
      ...payment,
      amount: 1451,
      date: "2026-10-15",
    });
    expect(resent.data.status).toBe("possible_duplicate");
  });

  it("flags an email already saved with approved income", async () => {
    const id = await pendingIdOf(await addIncome(A, payment));
    await approvePendingIncome(id);
    const resent = await addIncome(A, {
      ...payment,
      amount: 99,
      date: "2026-10-20",
    });
    expect(resent.data).toMatchObject({
      status: "possible_duplicate",
      match: { kind: "income" },
    });
  });

  it("keeps each user's income separate", async () => {
    await addIncome(A, payment);
    const other = await addIncome(B, payment);
    expect(other.data.status).toBe("pending_review");
    expect(await selectPendingIncomeList("user_b")).toHaveLength(1);
    expect(await selectPendingIncomeList("user_a")).toHaveLength(1);
  });

  it("only deposits into the caller's own chequing or savings account", async () => {
    const card = await insertAccount("user_a", {
      type: "credit_card",
      name: "Visa",
      institution: "RBC",
      lastFour: "1234",
      balanceCents: 0,
      balanceSource: "manual",
      creditLimitCents: null,
      availableCreditCents: null,
      statementBalanceCents: null,
      paymentDueDate: null,
      minimumPaymentCents: null,
    });
    const intoCard = await addIncome(A, { ...payment, account_id: card });
    expect(intoCard.isError).toBe(true);
    expect(intoCard.summary).toMatch(/chequing or savings/);

    const theirs = await insertAccount("user_b", {
      type: "savings",
      name: "Savings",
      institution: "TD",
      lastFour: "9999",
      balanceCents: 0,
      balanceSource: "manual",
      creditLimitCents: null,
      availableCreditCents: null,
      statementBalanceCents: null,
      paymentDueDate: null,
      minimumPaymentCents: null,
    });
    expect(
      (await addIncome(A, { ...payment, account_id: theirs })).isError,
    ).toBe(true);
    expect(await selectPendingIncomeList("user_a")).toEqual([]);
    expect(putReceiptFile).not.toHaveBeenCalled();
  });

  it("rejects a bad amount or date as a readable tool error", async () => {
    await expect(addIncome(A, { ...payment, amount: -5 })).rejects.toThrow();
    await expect(
      addIncome(A, { ...payment, date: "2026-02-31" }),
    ).rejects.toThrow();
  });

  it("keeps a PDF attachment instead of the email when there is one", async () => {
    const result = await addIncome(A, {
      ...payment,
      receipt: {
        total: 1450,
        pdf_base64: PDF_BASE64,
        pdf_filename: "Remittance-1042.pdf",
        email: { ...etransferEmail("1,450.00"), html: undefined },
      },
    });
    expect(result.data.receipt_kind).toBe("pdf");
  });
});

describe("approving income", () => {
  it("adds it to take-home for its month, with its receipt", async () => {
    const id = await pendingIdOf(await addIncome(A, payment));
    expect((await approvePendingIncome(id)).ok).toBe(true);

    expect(await selectPendingIncomeList("user_a")).toEqual([]);
    const [entry] = await selectIncomeBetween("user_a", "2026-10", "2026-10");
    expect(entry).toMatchObject({
      month: "2026-10",
      label: "Drift Landscaping",
      payer: "DRIFT LANDSCAPING LTD",
      amountCents: 145_000,
      receivedOn: "2026-10-14",
      receiptKind: "email",
    });
    expect(entry?.receiptId).toBeTruthy();

    // The receipt opens like any other, for its owner only.
    expect(await getReceiptFile(String(entry?.receiptId))).toMatchObject({
      kind: "email",
    });
    signInAs("user_b");
    expect(await getReceiptFile(String(entry?.receiptId))).toBeNull();
  });

  it("can't be approved twice, or by someone else", async () => {
    const id = await pendingIdOf(await addIncome(A, payment));
    signInAs("user_b");
    expect((await approvePendingIncome(id)).ok).toBe(false);
    signInAs("user_a");
    expect((await approvePendingIncome(id)).ok).toBe(true);
    expect((await approvePendingIncome(id)).ok).toBe(false);
    expect(
      await selectIncomeBetween("user_a", "2026-10", "2026-10"),
    ).toHaveLength(1);
  });

  it("raises chequing by a deposit dated after the balance, not an older one", async () => {
    await syncBankBalance(A, { balance: 100 });
    const day = today();
    const recent = await pendingIdOf(
      await addIncome(A, {
        ...payment,
        date: day,
        receipt: undefined,
      }),
    );
    const january = await pendingIdOf(
      await addIncome(A, {
        ...payment,
        amount: 1552.5,
        date: "2026-01-15",
        receipt: undefined,
      }),
    );
    await approvePendingIncome(january);
    // Already in the bank's number: January's deposit doesn't change it.
    expect((await getBankBalance())?.balanceCents).toBe(10_000);

    await approvePendingIncome(recent);
    const balance = await getBankBalance();
    expect(balance?.balanceCents).toBe(10_000 + 145_000);
    expect(balance?.depositsSinceCents).toBe(145_000);
  });

  it("goes into the account it names", async () => {
    await syncBankBalance(A, { balance: 0 });
    const savings = await insertAccount("user_a", {
      type: "savings",
      name: "Savings",
      institution: "TD",
      lastFour: "5555",
      balanceCents: 0,
      balanceSource: "manual",
      creditLimitCents: null,
      availableCreditCents: null,
      statementBalanceCents: null,
      paymentDueDate: null,
      minimumPaymentCents: null,
    });
    const id = await pendingIdOf(
      await addIncome(A, {
        ...payment,
        date: today(),
        account_id: savings,
        receipt: undefined,
      }),
    );
    const [item] = await selectPendingIncomeList("user_a");
    expect(item?.accountName).toBe("Savings");
    await approvePendingIncome(id);

    const accounts = await selectAccounts("user_a");
    expect(accounts.find((a) => a.id === savings)?.balanceCents).toBe(145_000);
    expect(accounts.find((a) => a.isPrimary)?.balanceCents).toBe(0);
  });

  it("never touches the balance for take-home typed in by hand", async () => {
    await syncBankBalance(A, { balance: 50 });
    await rows(
      `insert into income (user_id, month, label, amount_cents, received_on)
       values ($1, $2, 'Paycheque', 200000, $3)`,
      ["user_a", today().slice(0, 7), today()],
    );
    expect((await getBankBalance())?.balanceCents).toBe(5_000);
  });

  it("shows in the receipts library with the deposit's amount and label", async () => {
    const id = await pendingIdOf(
      await addIncome(A, {
        ...payment,
        receipt: { email: etransferEmail("1,450.00") },
      }),
    );
    await approvePendingIncome(id);
    const [entry] = await selectReceiptLibrary("user_a", "", 50);
    expect(entry).toMatchObject({
      date: "2026-10-14",
      month: "2026-10",
      totalCents: 145_000,
      descriptions: ["Drift Landscaping"],
      kind: "email",
    });
    expect(await selectReceiptLibrary("user_a", "drift", 50)).toHaveLength(1);
  });

  it("brings its receipt back when a deleted entry is undone", async () => {
    const id = await pendingIdOf(await addIncome(A, payment));
    await approvePendingIncome(id);
    const [entry] = await selectIncomeBetween("user_a", "2026-10", "2026-10");
    const deleted = await deleteIncomeWithUndo(String(entry?.id));
    if (!deleted.ok) throw new Error("delete failed");
    expect(await selectIncomeBetween("user_a", "2026-10", "2026-10")).toEqual(
      [],
    );
    expect((await undoDelete(deleted.undoId)).ok).toBe(true);
    const [restored] = await selectIncomeBetween(
      "user_a",
      "2026-10",
      "2026-10",
    );
    expect(restored?.receiptId).toBe(entry?.receiptId);
  });
});

describe("rejecting income", () => {
  it("throws it away, and its receipt file is no longer in use", async () => {
    const id = await pendingIdOf(await addIncome(A, payment));
    const pathname = String(vi.mocked(putReceiptFile).mock.calls.at(-1)?.[0]);
    expect(await selectPhotosInUse([pathname], 15)).toEqual(
      new Set([pathname]),
    );

    expect((await rejectPendingIncome(id)).ok).toBe(true);
    expect(await selectPendingIncomeList("user_a")).toEqual([]);
    expect(await selectIncomeBetween("user_a", "2026-01", "2026-12")).toEqual(
      [],
    );
    expect(await selectPhotosInUse([pathname], 15)).toEqual(new Set());
  });
});

describe("list_income", () => {
  it("lists saved and pending income between two days", async () => {
    const id = await pendingIdOf(await addIncome(A, payment));
    await approvePendingIncome(id);
    await addIncome(A, {
      ...payment,
      amount: 2000,
      date: "2026-10-01",
      receipt: undefined,
    });
    await addIncome(A, {
      ...payment,
      amount: 960,
      date: "2026-04-15",
      receipt: undefined,
    });

    const result = await listIncome(A, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(result.data.income).toEqual([
      expect.objectContaining({
        date: "2026-10-14",
        amount: 1450,
        payer: "DRIFT LANDSCAPING LTD",
        has_receipt: true,
        receipt_kind: "email",
      }),
    ]);
    expect(result.data.pending_review).toEqual([
      expect.objectContaining({ date: "2026-10-01", amount: 2000 }),
    ]);
    expect(
      (await listIncome(B, { from: "2026-01-01", to: "2026-12-31" })).data,
    ).toMatchObject({ income: [], pending_review: [] });
  });

  it("rejects a range that ends before it starts", async () => {
    const result = await listIncome(A, {
      from: "2026-10-31",
      to: "2026-10-01",
    });
    expect(result.isError).toBe(true);
  });
});

describe("income and expenses stay apart", () => {
  it("an expense with the same amount and day isn't an income duplicate", async () => {
    await addExpense(A, {
      amount: 1450,
      date: "2026-10-14",
      merchant: "Someone",
      category: "Other",
      is_subscription: false,
    });
    expect((await addIncome(A, payment)).data.status).toBe("pending_review");
  });
});
