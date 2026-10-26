import { describe, expect, it } from "vitest";
import {
  type AccountType,
  accountSchema,
  balanceAsOfLabel,
  balanceNote,
  formatBalance,
  institutionsMatch,
  matchAccount,
  netChequingCents,
  proposedAccountName,
  totalOwedCents,
  transferSchema,
} from "@/lib/accounts";

const plain = (text: string) => text.replace(/\s/g, " ");

const acct = (
  type: AccountType,
  balanceCents: number,
  extra: { institution?: string; lastFour?: string; name?: string } = {},
) => ({
  type,
  balanceCents,
  institution: extra.institution ?? null,
  lastFour: extra.lastFour ?? null,
  name: extra.name ?? type,
});

describe("netChequingCents", () => {
  it("is null with no chequing accounts", () => {
    expect(netChequingCents([])).toBeNull();
    expect(netChequingCents([acct("credit_card", 50_000)])).toBeNull();
  });

  it("adds up every chequing account", () => {
    expect(
      netChequingCents([acct("chequing", 120_000), acct("chequing", -20_000)]),
    ).toBe(100_000);
    expect(
      netChequingCents([acct("chequing", 10_000), acct("chequing", -30_000)]),
    ).toBe(-20_000);
  });

  it("ignores credit card, line of credit and savings balances", () => {
    expect(
      netChequingCents([
        acct("chequing", 40_000),
        acct("credit_card", 900_000),
        acct("line_of_credit", 1_500_000),
        acct("savings", 5_000_000),
      ]),
    ).toBe(40_000);
  });
});

describe("totalOwedCents", () => {
  it("adds what's owed on credit cards and lines of credit only", () => {
    expect(
      totalOwedCents([
        acct("chequing", 40_000),
        acct("credit_card", 90_000),
        acct("line_of_credit", 150_000),
      ]),
    ).toBe(240_000);
  });
});

describe("institutionsMatch", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(institutionsMatch("RBC", "rbc")).toBe(true);
    expect(institutionsMatch("Scotiabank", "Scotia")).toBe(true);
    expect(institutionsMatch("TD Canada Trust", "TD")).toBe(true);
    expect(institutionsMatch("Tangerine", "RBC")).toBe(false);
  });

  it("never matches a blank or one-letter name", () => {
    expect(institutionsMatch(null, "RBC")).toBe(false);
    expect(institutionsMatch("R", "RBC")).toBe(false);
  });
});

describe("matchAccount", () => {
  const visa = acct("credit_card", 0, { institution: "RBC", lastFour: "1234" });
  const chequing = acct("chequing", 0, {
    institution: "RBC Royal Bank",
    lastFour: "9876",
  });
  const td = acct("credit_card", 0, { institution: "TD", lastFour: "1234" });

  it("finds the account by institution plus last four", () => {
    expect(
      matchAccount([visa, chequing, td], {
        institution: "RBC Royal Bank",
        lastFour: "1234",
      }),
    ).toEqual({ kind: "match", account: visa });
  });

  it("finds nothing for a new account, listing same-digit accounts elsewhere", () => {
    expect(
      matchAccount([visa, chequing, td], {
        institution: "Tangerine",
        lastFour: "1234",
      }),
    ).toEqual({ kind: "none", similar: [visa, td] });
    expect(
      matchAccount([visa], { institution: "RBC", lastFour: "5555" }),
    ).toEqual({ kind: "none", similar: [] });
  });

  it("is ambiguous when two accounts match, unless the type settles it", () => {
    const loc = acct("line_of_credit", 0, {
      institution: "RBC",
      lastFour: "1234",
    });
    expect(
      matchAccount([visa, loc], { institution: "RBC", lastFour: "1234" }),
    ).toEqual({ kind: "ambiguous", accounts: [visa, loc] });
    expect(
      matchAccount([visa, loc], {
        institution: "RBC",
        lastFour: "1234",
        type: "line_of_credit",
      }),
    ).toEqual({ kind: "match", account: loc });
  });
});

describe("labels", () => {
  it("names a proposed account by institution, type and last four", () => {
    expect(proposedAccountName(" RBC ", "credit_card", "1234")).toBe(
      "RBC Credit card ••1234",
    );
  });

  it("marks what's owed and an overdrawn chequing account", () => {
    expect(balanceNote(acct("credit_card", 5_000))).toBe("Owed");
    expect(balanceNote(acct("credit_card", -5_000))).toBe("In credit");
    expect(balanceNote(acct("chequing", -1))).toBe("Overdrawn");
    expect(balanceNote(acct("chequing", 1))).toBeNull();
    expect(plain(formatBalance(acct("credit_card", -5_000)))).toBe("$50.00");
  });

  it("says a statement balance is from the statement", () => {
    expect(
      balanceAsOfLabel({
        balanceAsOf: "2026-10-16T06:00:00.000Z",
        balanceSource: "statement",
        statementClosingDate: "2026-10-15",
      }),
    ).toBe("From the Oct 15, 2026 statement");
    expect(
      balanceAsOfLabel({
        balanceAsOf: "2026-10-25T20:52:00.000Z",
        balanceSource: "manual",
        statementClosingDate: null,
      }),
    ).toMatch(/^Updated Oct 25/);
  });
});

describe("accountSchema", () => {
  const base = { name: "Visa", type: "credit_card", balance: "842.19" };

  it("reads a credit card with its optional details", () => {
    expect(
      accountSchema.parse({
        ...base,
        institution: " RBC ",
        lastFour: "1234",
        creditLimit: "5,000",
        availableCredit: "4157.81",
        statementBalance: "842.19",
        paymentDueDate: "2026-11-08",
        minimumPayment: "25",
      }),
    ).toMatchObject({
      type: "credit_card",
      institution: "RBC",
      lastFour: "1234",
      balance: 84_219,
      creditLimit: 500_000,
      availableCredit: 415_781,
      minimumPayment: 2_500,
      paymentDueDate: "2026-11-08",
      isPrimary: false,
    });
  });

  it("leaves blank details empty and takes a negative chequing balance", () => {
    expect(
      accountSchema.parse({
        name: "Chequing",
        type: "chequing",
        balance: "-75",
        institution: "",
        lastFour: "",
        isPrimary: "on",
      }),
    ).toMatchObject({
      balance: -7_500,
      institution: null,
      lastFour: null,
      creditLimit: null,
      isPrimary: true,
    });
  });

  it("rejects a bad last four, type or balance", () => {
    expect(accountSchema.safeParse({ ...base, lastFour: "12a4" }).success).toBe(
      false,
    );
    expect(accountSchema.safeParse({ ...base, type: "savings" }).success).toBe(
      false,
    );
    expect(accountSchema.safeParse({ ...base, balance: "lots" }).success).toBe(
      false,
    );
  });
});

describe("transferSchema", () => {
  const a = "00000000-0000-4000-8000-000000000001";
  const b = "00000000-0000-4000-8000-000000000002";

  it("reads a transfer between two accounts", () => {
    expect(
      transferSchema.parse({
        fromAccountId: a,
        toAccountId: b,
        amount: "842.19",
        transferredOn: "2026-10-30",
      }),
    ).toMatchObject({ amount: 84_219, description: null });
  });

  it("needs two different accounts and an amount above zero", () => {
    const t = {
      fromAccountId: a,
      toAccountId: a,
      amount: "5",
      transferredOn: "2026-10-30",
    };
    expect(transferSchema.safeParse(t).success).toBe(false);
    expect(
      transferSchema.safeParse({ ...t, toAccountId: b, amount: "0" }).success,
    ).toBe(false);
  });
});
