import { describe, expect, it, vi } from "vitest";
import {
  approvePendingAccount,
  createAccount,
  createTransfer,
  deleteAccount,
  deleteTransfer,
  rejectPendingAccount,
  updateAccount,
} from "@/actions/accounts";
import { createExpense } from "@/actions/expenses";
import { getAccounts } from "@/dal/accounts";
import { getBankBalance } from "@/dal/bank-balance";
import type { AccountFormValues } from "@/lib/accounts";
import { deleteStatementPdf } from "@/lib/statement-store";
import { recordStatement } from "@/mcp/account-tools";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

vi.mock("@/lib/statement-store", () => ({
  putStatementPdf: vi.fn(),
  deleteStatementPdf: vi.fn(),
}));

const chequing: AccountFormValues = {
  name: "Everyday",
  type: "chequing",
  institution: "TD",
  lastFour: "9876",
  balance: "1,000",
};

const visa: AccountFormValues = {
  name: "Visa",
  type: "credit_card",
  institution: "RBC",
  lastFour: "1234",
  balance: "842.19",
  creditLimit: "5000",
  minimumPayment: "25",
  paymentDueDate: "2026-11-08",
};

const idOf = async (name: string) =>
  String((await getAccounts()).find((a) => a.name === name)?.id);

describe("account actions", () => {
  it("adds accounts; the first chequing account is the one expenses come off", async () => {
    expect(await createAccount(chequing)).toEqual({ ok: true });
    expect(await createAccount(visa)).toEqual({ ok: true });
    const accounts = await getAccounts();
    expect(accounts.map((a) => [a.name, a.type, a.isPrimary])).toEqual([
      ["Everyday", "chequing", true],
      ["Visa", "credit_card", false],
    ]);
    expect(accounts[1]).toMatchObject({
      balanceCents: 84_219,
      creditLimitCents: 500_000,
      minimumPaymentCents: 2_500,
      paymentDueDate: "2026-11-08",
    });
    expect((await getBankBalance())?.balanceCents).toBe(100_000);
  });

  it("renames an account without resetting its balance or what came off it", async () => {
    await createAccount(chequing);
    await rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");
    await createExpense({
      description: "Shell",
      category: "Transportation",
      amount: "40",
      spentOn: "2026-10-20",
    });
    const id = await idOf("Everyday");
    expect(
      await updateAccount(id, {
        ...chequing,
        name: "Main chequing",
        balance: "960.00",
        isPrimary: "on",
      }),
    ).toEqual({ ok: true });
    const [account] = await getAccounts();
    expect(account).toMatchObject({
      name: "Main chequing",
      balanceCents: 96_000,
      enteredCents: 100_000,
      spentSinceCents: 4_000,
    });
  });

  it("re-enters the balance as of now when it's edited", async () => {
    await createAccount(chequing);
    const id = await idOf("Everyday");
    await updateAccount(id, { ...chequing, balance: "-50" });
    const [account] = await getAccounts();
    expect(account).toMatchObject({
      balanceCents: -5_000,
      enteredCents: -5_000,
      balanceSource: "manual",
    });
  });

  it("moves 'expenses come off this' to another chequing account", async () => {
    await createAccount(chequing);
    await createAccount({ ...chequing, name: "Joint", lastFour: "5555" });
    await updateAccount(await idOf("Joint"), {
      ...chequing,
      name: "Joint",
      lastFour: "5555",
      isPrimary: "on",
    });
    const primary = (await getAccounts()).filter((a) => a.isPrimary);
    expect(primary.map((a) => a.name)).toEqual(["Joint"]);
  });

  it("deletes an account, its statements and PDFs, and promotes another chequing account", async () => {
    await createAccount(chequing);
    await createAccount({ ...chequing, name: "Joint", lastFour: "5555" });
    await recordStatement(
      { userId: "user_a", client: null },
      {
        institution: "TD",
        last_four: "9876",
        closing_date: "2026-10-15",
        balance: 900,
        pdf_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
      },
    );
    expect(await deleteAccount(await idOf("Everyday"))).toEqual({ ok: true });
    expect(await rows("select * from account_statements")).toHaveLength(0);
    expect(deleteStatementPdf).toHaveBeenCalledWith(
      expect.stringMatching(/^statements\/user_a\//),
    );
    const accounts = await getAccounts();
    expect(accounts.map((a) => [a.name, a.isPrimary])).toEqual([
      ["Joint", true],
    ]);
  });

  it("reports a bad last four next to the field and saves nothing", async () => {
    const result = await createAccount({ ...visa, lastFour: "12" });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { lastFour: ["Enter the last four digits, like 1234"] },
    });
    expect(await getAccounts()).toEqual([]);
  });

  it("keeps each user's accounts separate", async () => {
    signInAs("user_b");
    await createAccount(visa);
    const theirs = await idOf("Visa");
    signInAs("user_a");
    expect(await getAccounts()).toEqual([]);
    expect(await deleteAccount(theirs)).toMatchObject({ ok: false });
    expect(await updateAccount(theirs, visa)).toMatchObject({ ok: false });
  });

  it("refuses when signed out", async () => {
    signOut();
    expect(await createAccount(chequing)).toMatchObject({ ok: false });
    expect(await rows("select * from accounts")).toHaveLength(0);
  });
});

describe("transfer actions", () => {
  it("records a card payment that changes both balances but isn't spending", async () => {
    await createAccount(chequing);
    await createAccount(visa);
    await rows("update accounts set balance_as_of = '2026-10-01T18:00:00Z'");
    const values = {
      fromAccountId: await idOf("Everyday"),
      toAccountId: await idOf("Visa"),
      amount: "842.19",
      transferredOn: "2026-10-30",
      description: "Visa payment",
    };
    expect(await createTransfer(values)).toEqual({ ok: true });
    const [cheq, card] = await getAccounts();
    expect(cheq?.balanceCents).toBe(100_000 - 84_219);
    expect(card?.balanceCents).toBe(0);
    expect(await rows("select * from expenses")).toHaveLength(0);

    const [transfer] = await rows("select id from account_transfers");
    expect(await deleteTransfer(String(transfer?.id))).toEqual({ ok: true });
    const [cheqAfter, cardAfter] = await getAccounts();
    expect(cheqAfter?.balanceCents).toBe(100_000);
    expect(cardAfter?.balanceCents).toBe(84_219);
  });

  it("needs two of the user's own accounts", async () => {
    await createAccount(chequing);
    signInAs("user_b");
    await createAccount(visa);
    const theirs = await idOf("Visa");
    signInAs("user_a");
    expect(
      await createTransfer({
        fromAccountId: await idOf("Everyday"),
        toAccountId: theirs,
        amount: "5",
        transferredOn: "2026-10-30",
      }),
    ).toMatchObject({ ok: false });
    expect(await rows("select * from account_transfers")).toHaveLength(0);
  });
});

describe("proposed accounts on the Review page", () => {
  const propose = () =>
    recordStatement(
      { userId: "user_a", client: "Claude" },
      {
        institution: "Amex",
        last_four: "1005",
        account_type: "credit_card",
        closing_date: "2026-10-15",
        balance: 120,
        pdf_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
      },
    );

  it("creates nothing until approved", async () => {
    await propose();
    expect(await getAccounts()).toEqual([]);
    const [pending] = await rows("select id from pending_accounts");
    expect(await approvePendingAccount(String(pending?.id))).toEqual({
      ok: true,
    });
    expect(await getAccounts()).toHaveLength(1);
    expect(await rows("select * from pending_accounts")).toHaveLength(0);
    expect(await approvePendingAccount(String(pending?.id))).toMatchObject({
      ok: false,
    });
    expect(await getAccounts()).toHaveLength(1);
  });

  it("rejecting throws the proposal and its PDF away", async () => {
    await propose();
    const [pending] = await rows("select id from pending_accounts");
    expect(await rejectPendingAccount(String(pending?.id))).toEqual({
      ok: true,
    });
    expect(await getAccounts()).toEqual([]);
    expect(await rows("select * from pending_accounts")).toHaveLength(0);
    expect(deleteStatementPdf).toHaveBeenCalledWith(
      expect.stringMatching(/^statements\/user_a\//),
    );
  });

  it("can't approve another user's proposal", async () => {
    await propose();
    const [pending] = await rows("select id from pending_accounts");
    signInAs("user_b");
    expect(await approvePendingAccount(String(pending?.id))).toMatchObject({
      ok: false,
    });
    signInAs("user_a");
    expect(await getAccounts()).toEqual([]);
  });
});
