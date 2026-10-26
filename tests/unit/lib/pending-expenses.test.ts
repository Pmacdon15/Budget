import { describe, expect, it } from "vitest";
import {
  addExpenseInputSchema,
  duplicateMessage,
  editExpenseInputSchema,
  listExpensesInputSchema,
  syncBankBalanceInputSchema,
  toCents,
} from "@/lib/pending-expenses";

const valid = {
  amount: 45.67,
  date: "2026-10-20",
  merchant: "Shell",
  category: "Transportation",
};

const issue = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues[0]?.message;

describe("addExpenseInputSchema", () => {
  it("takes what an AI sends for a charge", () => {
    expect(
      addExpenseInputSchema.parse({
        ...valid,
        source: "  Email from receipts@shell.ca  ",
      }),
    ).toEqual({ ...valid, source: "Email from receipts@shell.ca" });
  });

  it.each([
    [0, "The amount must be more than zero"],
    [-5, "The amount must be more than zero"],
    [12.345, "Use at most two decimal places"],
    [2_000_000, "That amount is too large"],
  ])("refuses an amount of %s", (amount, message) => {
    expect(issue(addExpenseInputSchema.safeParse({ ...valid, amount }))).toBe(
      message,
    );
  });

  it.each([
    ["Oct 20", "Use the date as YYYY-MM-DD"],
    ["2026-02-31", "That date doesn't exist"],
    ["2026-13-01", "That date doesn't exist"],
  ])("refuses the date %s", (date, message) => {
    expect(issue(addExpenseInputSchema.safeParse({ ...valid, date }))).toBe(
      message,
    );
  });

  it("only takes the app's categories", () => {
    expect(
      addExpenseInputSchema.safeParse({ ...valid, category: "Gas" }).success,
    ).toBe(false);
  });

  it("requires a merchant", () => {
    expect(
      issue(addExpenseInputSchema.safeParse({ ...valid, merchant: "  " })),
    ).toBe("Merchant is required");
  });
});

describe("other tool inputs", () => {
  it("lets the bank balance go below zero", () => {
    expect(syncBankBalanceInputSchema.parse({ balance: -75.5 })).toEqual({
      balance: -75.5,
    });
  });

  it("needs an id to edit, and nothing else", () => {
    expect(editExpenseInputSchema.safeParse({}).success).toBe(false);
    expect(
      editExpenseInputSchema.parse({
        id: "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10",
        amount: 10,
      }),
    ).toEqual({ id: "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10", amount: 10 });
  });

  it("lists with no dates at all", () => {
    expect(listExpensesInputSchema.parse({})).toEqual({});
  });
});

describe("toCents", () => {
  it("rounds dollars to whole cents", () => {
    expect(toCents(45.67)).toBe(4_567);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-12.5)).toBe(-1_250);
  });
});

describe("duplicateMessage", () => {
  const match = {
    id: "x",
    description: "Shell",
    spentOn: "2026-10-20",
    amountCents: 4_567,
  };
  it("says whether the match is saved or still in review", () => {
    expect(
      duplicateMessage({ ...match, kind: "expense" }).replace(/\s/g, " "),
    ).toBe("Possible duplicate: Shell, $45.67 on 2026-10-20 (already saved).");
    expect(duplicateMessage({ ...match, kind: "pending" })).toContain(
      "already waiting for review",
    );
  });
});
