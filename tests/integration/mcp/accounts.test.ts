import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvePendingAccount } from "@/actions/accounts";
import { setBankBalance } from "@/actions/bank-balance";
import { createExpense } from "@/actions/expenses";
import { getBankBalance } from "@/dal/bank-balance";
import { buildMonthOverview } from "@/dal/overview";
import { insertAccount, selectAccount, selectAccounts } from "@/db/accounts";
import { insertIncome } from "@/db/income";
import { currentMonth } from "@/lib/month";
import { deleteStatementPdf, putStatementPdf } from "@/lib/statement-store";
import {
  listAccounts,
  proposeAccount,
  recordStatement,
  recordTransfer,
  updateAccountBalance,
} from "@/mcp/account-tools";
import type { McpCaller } from "@/mcp/tools";
import { syncBankBalance } from "@/mcp/tools";
import { rows } from "../../helpers/test-db";

/*
 * The MCP account tools against the real schema: listing accounts,
 * proposing one (it waits on the Review page), updating a balance, recording
 * statements (with their PDF) and transfers. PDFs go to a mocked store.
 */

vi.mock("@/lib/statement-store", () => ({
  putStatementPdf: vi.fn(),
  deleteStatementPdf: vi.fn(),
}));

const A: McpCaller = { userId: "user_a", client: "Claude" };
const B: McpCaller = { userId: "user_b", client: "Gemini" };

const PDF_BASE64 = Buffer.from("%PDF-1.7\nstatement").toString("base64");
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString(
  "base64",
);

const statement = {
  institution: "RBC",
  last_four: "1234",
  closing_date: "2026-10-15",
  balance: 842.19,
  minimum_payment: 25,
  payment_due_date: "2026-11-08",
  source: "RBC: Your Visa statement is ready",
};

const card = (userId = "user_a") =>
  insertAccount(userId, {
    type: "credit_card",
    name: "RBC Visa",
    institution: "RBC Royal Bank",
    lastFour: "1234",
    balanceCents: 30_000,
    balanceSource: "manual",
    creditLimitCents: 500_000,
    availableCreditCents: null,
    statementBalanceCents: null,
    paymentDueDate: null,
    minimumPaymentCents: null,
  });

const chequing = (name = "Chequing", balanceCents = 100_000) =>
  insertAccount("user_a", {
    type: "chequing",
    name,
    institution: "TD",
    lastFour: name === "Chequing" ? "9876" : "5555",
    balanceCents,
    balanceSource: "manual",
    creditLimitCents: null,
    availableCreditCents: null,
    statementBalanceCents: null,
    paymentDueDate: null,
    minimumPaymentCents: null,
  });

/** Marks every account's balance as entered on Oct 1, before what's below. */
const balancesOnOct1 = () =>
  rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");

const balanceOf = async (id: string) =>
  (await selectAccount("user_a", id))?.balanceCents;

beforeEach(() => {
  vi.mocked(putStatementPdf).mockClear();
  vi.mocked(deleteStatementPdf).mockClear();
});

describe("list_accounts", () => {
  it("lists accounts, net chequing and leftover spend, ignoring credit", async () => {
    await chequing("Chequing", 50_000);
    await chequing("Joint", -20_000);
    await card();
    const result = await listAccounts(A, {});
    expect(result.data).toMatchObject({
      net_chequing: 300,
      owed_on_credit: 300,
      pending_review: [],
    });
    const accounts = result.data.accounts as Record<string, unknown>[];
    expect(accounts).toHaveLength(3);
    expect(accounts.find((a) => a.type === "credit_card")).toMatchObject({
      balance: 300,
      balance_means: "owed",
      counts_toward_leftover_spend: false,
    });
  });

  it("reports leftover spend as zero while chequing is negative", async () => {
    await insertIncome("user_a", {
      month: currentMonth(),
      label: "Paycheque",
      amountCents: 300_000,
      receivedOn: null,
    });
    await chequing("Chequing", 10_000);
    await chequing("Joint", -60_000);
    await card();
    const result = await listAccounts(A, {});
    expect(result.data.leftover_spend).toMatchObject({
      amount: 0,
      budget_left: 3_000,
      limited_by: "overdrawn",
    });
    expect(result.summary).toContain("nothing is left to spend");
  });

  it("leaves out proposed accounts when asked", async () => {
    await proposeAccount(A, {
      type: "line_of_credit",
      institution: "Scotiabank",
      last_four: "4321",
      balance: 1500,
    });
    expect((await listAccounts(A, {})).data.pending_review).toHaveLength(1);
    expect(
      (await listAccounts(A, { include_proposed: false })).data.pending_review,
    ).toEqual([]);
  });

  it("only shows the caller's accounts", async () => {
    await card("user_b");
    expect((await listAccounts(A, {})).data.accounts).toEqual([]);
  });
});

describe("propose_account", () => {
  it("sends a new account to Pending Review, creating nothing", async () => {
    const result = await proposeAccount(A, {
      type: "line_of_credit",
      institution: "Scotiabank",
      last_four: "4321",
      balance: 1500,
    });
    expect(result.data).toMatchObject({
      status: "pending_review",
      name: "Scotiabank Line of credit ••4321",
    });
    expect(await selectAccounts("user_a")).toEqual([]);
    expect(await rows("select client from pending_accounts")).toEqual([
      { client: "Claude" },
    ]);
  });

  it("doesn't propose an account the user already has, or one already waiting", async () => {
    await card();
    expect(
      (
        await proposeAccount(A, {
          type: "credit_card",
          institution: "RBC",
          last_four: "1234",
        })
      ).data.status,
    ).toBe("already_exists");
    const proposal = {
      type: "credit_card",
      institution: "Amex",
      last_four: "1005",
    };
    await proposeAccount(A, proposal);
    expect((await proposeAccount(A, proposal)).data.status).toBe(
      "already_pending",
    );
    expect(await rows("select * from pending_accounts")).toHaveLength(1);
  });
});

describe("update_account_balance", () => {
  it("finds the account by institution plus last four and sets its balance", async () => {
    const id = await card();
    const result = await updateAccountBalance(A, {
      institution: "rbc",
      last_four: "1234",
      balance: 412.08,
      source: "RBC: balance alert",
    });
    expect(result.data.status).toBe("updated");
    expect(await balanceOf(id)).toBe(41_208);
    const [row] = await rows("select balance_source from accounts");
    expect(row?.balance_source).toBe("RBC: balance alert");
  });

  it("never replaces a newer balance with an older one", async () => {
    const id = await card();
    // Entered just now; the alert is from earlier in the month.
    const result = await updateAccountBalance(A, {
      account_id: id,
      balance: 999,
      as_of: "2026-10-01",
    });
    expect(result.data.status).toBe("kept_newer");
    expect(await balanceOf(id)).toBe(30_000);
  });

  it("asks instead of guessing when no account or several match", async () => {
    await card();
    const none = await updateAccountBalance(A, {
      institution: "Tangerine",
      last_four: "1234",
      balance: 5,
    });
    expect(none).toMatchObject({ isError: true, data: { status: "no_match" } });
    expect(none.summary).toContain("propose_account");

    await insertAccount("user_a", {
      type: "line_of_credit",
      name: "RBC LOC",
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
    const both = await updateAccountBalance(A, {
      institution: "RBC",
      last_four: "1234",
      balance: 5,
    });
    expect(both).toMatchObject({
      isError: true,
      data: { status: "ambiguous" },
    });
    expect(both.summary).toContain("Ask the user which one");
  });

  it("can't touch another user's account", async () => {
    const id = await card("user_b");
    const result = await updateAccountBalance(A, {
      account_id: id,
      balance: 1,
    });
    expect(result.isError).toBe(true);
    expect((await selectAccount("user_b", id))?.balanceCents).toBe(30_000);
  });

  it("refuses a balance dated in the future", async () => {
    const id = await card();
    const result = await updateAccountBalance(A, {
      account_id: id,
      balance: 1,
      as_of: "2999-01-01",
    });
    expect(result.isError).toBe(true);
  });
});

describe("record_statement", () => {
  it("updates the matching account as of the closing date", async () => {
    const id = await card();
    await balancesOnOct1();
    const result = await recordStatement(A, statement);
    expect(result.data).toMatchObject({
      status: "recorded",
      balance_updated: true,
      has_pdf: false,
    });
    expect(await selectAccount("user_a", id)).toMatchObject({
      balanceCents: 84_219,
      balanceSource: "statement",
      statementBalanceCents: 84_219,
      statementClosingDate: "2026-10-15",
      paymentDueDate: "2026-11-08",
      minimumPaymentCents: 2_500,
      creditLimitCents: 500_000,
    });
  });

  it("never overwrites a newer balance (a later alert) with an older statement", async () => {
    const id = await card();
    // A low-balance alert just now, after the statement closed.
    await updateAccountBalance(A, { account_id: id, balance: 120 });
    const result = await recordStatement(A, statement);
    expect(result.data).toMatchObject({
      status: "recorded",
      balance_updated: false,
    });
    expect(result.summary).toContain("newer balance");
    expect(await selectAccount("user_a", id)).toMatchObject({
      balanceCents: 12_000,
      statementBalanceCents: 84_219,
    });
  });

  it("saves the statement PDF like a receipt, in the user's private folder", async () => {
    await card();
    const result = await recordStatement(A, {
      ...statement,
      pdf_base64: PDF_BASE64,
    });
    expect(result.data).toMatchObject({ status: "recorded", has_pdf: true });
    expect(putStatementPdf).toHaveBeenCalledTimes(1);
    const [pathname, blob] = vi.mocked(putStatementPdf).mock.calls[0] ?? [];
    expect(pathname).toMatch(/^statements\/user_a\/[0-9a-f-]{36}\.pdf$/);
    expect((blob as Blob).type).toBe("application/pdf");
    expect(await rows("select pdf_pathname from account_statements")).toEqual([
      { pdf_pathname: pathname },
    ]);
  });

  it("refuses an attachment that isn't a PDF, saving nothing", async () => {
    await card();
    const result = await recordStatement(A, {
      ...statement,
      pdf_base64: JPEG_BASE64,
    });
    expect(result.isError).toBe(true);
    expect(putStatementPdf).not.toHaveBeenCalled();
    expect(await rows("select * from account_statements")).toHaveLength(0);
  });

  it("changes nothing when the same statement is recorded twice", async () => {
    const id = await card();
    await balancesOnOct1();
    await recordStatement(A, { ...statement, pdf_base64: PDF_BASE64 });
    const before = await selectAccount("user_a", id);
    const statementsBefore = await rows("select * from account_statements");

    const again = await recordStatement(A, {
      ...statement,
      pdf_base64: PDF_BASE64,
    });
    expect(again.data.status).toBe("already_recorded");
    expect(await selectAccount("user_a", id)).toEqual(before);
    expect(await rows("select * from account_statements")).toEqual(
      statementsBefore,
    );
    expect(putStatementPdf).toHaveBeenCalledTimes(1);
  });

  it("attaches the PDF to a statement first recorded without one", async () => {
    await card();
    await recordStatement(A, statement);
    const result = await recordStatement(A, {
      ...statement,
      pdf_base64: PDF_BASE64,
    });
    expect(result.data.status).toBe("pdf_attached");
    expect(
      (await rows("select pdf_pathname from account_statements"))[0]
        ?.pdf_pathname,
    ).toMatch(/^statements\/user_a\//);
  });

  it("proposes a new account, with the statement, when none matches", async () => {
    const result = await recordStatement(A, {
      ...statement,
      account_type: "credit_card",
      pdf_base64: PDF_BASE64,
    });
    expect(result.data).toMatchObject({
      status: "pending_review",
      name: "RBC Credit card ••1234",
      has_pdf: true,
    });
    expect(await selectAccounts("user_a")).toEqual([]);
    expect(await rows("select * from account_statements")).toHaveLength(0);

    // The same statement again doesn't propose it twice.
    expect(
      (await recordStatement(A, { ...statement, account_type: "credit_card" }))
        .data.status,
    ).toBe("already_pending");
    expect(await rows("select * from pending_accounts")).toHaveLength(1);

    // Approving it creates the account with its statement and PDF.
    const [pending] = await rows("select id from pending_accounts");
    expect(await approvePendingAccount(String(pending?.id))).toEqual({
      ok: true,
    });
    const [account] = await selectAccounts("user_a");
    expect(account).toMatchObject({
      name: "RBC Credit card ••1234",
      type: "credit_card",
      institution: "RBC",
      lastFour: "1234",
      balanceCents: 84_219,
      balanceSource: "statement",
      statementClosingDate: "2026-10-15",
      minimumPaymentCents: 2_500,
    });
    const statements = await rows(
      "select account_id, pdf_pathname from account_statements",
    );
    expect(statements).toHaveLength(1);
    expect(statements[0]?.account_id).toBe(account?.id);
    expect(statements[0]?.pdf_pathname).toMatch(/^statements\/user_a\//);

    // Later statements now go to that account.
    expect(
      (
        await recordStatement(A, {
          ...statement,
          closing_date: "2026-10-20",
          balance: 900,
        })
      ).data.status,
    ).toBe("recorded");
  });

  it("asks for the account type before proposing an unknown account", async () => {
    const result = await recordStatement(A, statement);
    expect(result).toMatchObject({
      isError: true,
      data: { status: "needs_account_type" },
    });
    expect(await rows("select * from pending_accounts")).toHaveLength(0);
  });

  it("refuses a closing date in the future", async () => {
    await card();
    expect(
      (await recordStatement(A, { ...statement, closing_date: "2999-01-01" }))
        .isError,
    ).toBe(true);
  });
});

describe("record_transfer", () => {
  it("moves money between accounts without counting it as spending", async () => {
    await setBankBalance({ balance: "1000" });
    const cardId = await card();
    await balancesOnOct1();
    const cheq = String((await getBankBalance())?.accountId);

    const result = await recordTransfer(A, {
      from_account_id: cheq,
      to_account_id: cardId,
      amount: 250,
      date: "2026-10-20",
      description: "Visa payment",
    });
    expect(result.data).toMatchObject({
      status: "recorded",
      counts_as_spending: false,
    });
    // Chequing goes down; what's owed on the card goes down too.
    expect(await balanceOf(cheq)).toBe(75_000);
    expect(await balanceOf(cardId)).toBe(5_000);
    // It's not an expense anywhere.
    expect(await rows("select * from expenses")).toHaveLength(0);
    const overview = await buildMonthOverview("user_a", "2026-10", 1);
    expect(overview.current.spentCents).toBe(0);
    expect(overview.expenses).toEqual([]);
  });

  it("isn't double-counted next to an expense the same day", async () => {
    await setBankBalance({ balance: "1000" });
    const cardId = await card();
    await balancesOnOct1();
    const cheq = String((await getBankBalance())?.accountId);
    // Two accounts, so the expense says which one paid.
    await createExpense({
      description: "Groceries",
      category: "Groceries",
      amount: "100",
      spentOn: "2026-10-20",
      accountId: cheq,
    });
    await recordTransfer(A, {
      from_account_id: cheq,
      to_account_id: cardId,
      amount: 250,
      date: "2026-10-20",
    });
    expect(await balanceOf(cheq)).toBe(100_000 - 10_000 - 25_000);
    const overview = await buildMonthOverview("user_a", "2026-10", 1);
    expect(overview.current.variableCents).toBe(10_000);
  });

  it("asks before recording the same transfer twice", async () => {
    const cheq = await chequing();
    const cardId = await card();
    const transfer = {
      from_account_id: cheq,
      to_account_id: cardId,
      amount: 250,
      date: "2026-10-20",
    };
    await recordTransfer(A, transfer);
    expect((await recordTransfer(A, transfer)).data.status).toBe(
      "possible_duplicate",
    );
    expect(await rows("select * from account_transfers")).toHaveLength(1);
    await recordTransfer(A, { ...transfer, allow_duplicate: true });
    expect(await rows("select * from account_transfers")).toHaveLength(2);
  });

  it("only moves money between the caller's own accounts", async () => {
    const cheq = await chequing();
    const theirs = await card("user_b");
    const result = await recordTransfer(A, {
      from_account_id: cheq,
      to_account_id: theirs,
      amount: 10,
      date: "2026-10-20",
    });
    expect(result.isError).toBe(true);
    expect(await rows("select * from account_transfers")).toHaveLength(0);
    expect((await listAccounts(B, {})).data.accounts).toHaveLength(1);
  });
});

describe("sync_bank_balance with accounts", () => {
  it("sets the primary chequing account, leaving credit cards alone", async () => {
    const cardId = await card();
    await syncBankBalance(A, { balance: 412.08 });
    const [primary] = (await selectAccounts("user_a")).filter(
      (a) => a.isPrimary,
    );
    expect(primary).toMatchObject({
      type: "chequing",
      balanceCents: 41_208,
      balanceSource: "alert",
    });
    expect(await balanceOf(cardId)).toBe(30_000);
  });
});
