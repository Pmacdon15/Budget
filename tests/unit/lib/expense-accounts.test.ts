import { describe, expect, it } from "vitest";
import {
  ACCOUNT_REQUIRED_MESSAGE,
  expenseAccountLabel,
  needsAccountChoice,
  requireAccount,
  resolveExpenseAccount,
} from "@/lib/expense-accounts";
import { expenseSchema } from "@/lib/schemas";

const cheq = { id: "a" };
const card = { id: "b" };

describe("resolveExpenseAccount", () => {
  it("uses no account when the user has none (the old bank balance)", () => {
    expect(resolveExpenseAccount([], undefined)).toEqual({
      kind: "ok",
      accountId: null,
      account: null,
    });
  });

  it("uses the only account without asking", () => {
    expect(resolveExpenseAccount([cheq], null)).toMatchObject({
      kind: "ok",
      accountId: "a",
    });
  });

  it("asks when there's more than one and none was named", () => {
    expect(resolveExpenseAccount([cheq, card], undefined)).toEqual({
      kind: "choose",
      accounts: [cheq, card],
    });
  });

  it("uses a named account only when it's the user's", () => {
    expect(resolveExpenseAccount([cheq, card], "b")).toMatchObject({
      kind: "ok",
      accountId: "b",
    });
    expect(resolveExpenseAccount([cheq, card], "z").kind).toBe("unknown");
    expect(resolveExpenseAccount([], "z").kind).toBe("unknown");
  });
});

describe("the account field", () => {
  const values = {
    description: "Shell",
    category: "Transportation",
    amount: "45.67",
    spentOn: "2026-10-20",
  };

  it("is optional on its own: empty means not chosen", () => {
    expect(expenseSchema.parse({ ...values, accountId: "" }).accountId).toBe(
      null,
    );
    expect(expenseSchema.parse(values).accountId).toBe(null);
  });

  it("rejects something that isn't an account id", () => {
    expect(expenseSchema.safeParse({ ...values, accountId: "x" }).success).toBe(
      false,
    );
  });

  it("is required once the user has several accounts", () => {
    const result = requireAccount(expenseSchema).safeParse(values);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["accountId"],
      message: ACCOUNT_REQUIRED_MESSAGE,
    });
    expect(
      requireAccount(expenseSchema).safeParse({
        ...values,
        accountId: "7d3e2c1b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
      }).success,
    ).toBe(true);
  });

  it("needs a choice only with more than one account", () => {
    expect(needsAccountChoice([])).toBe(false);
    expect(needsAccountChoice([cheq])).toBe(false);
    expect(needsAccountChoice([cheq, card])).toBe(true);
  });

  it("names accounts so a card can't be mistaken for chequing", () => {
    expect(
      expenseAccountLabel({
        name: "RBC Visa",
        type: "credit_card",
        institution: "RBC",
        lastFour: "1234",
      }),
    ).toBe("RBC Visa (Credit card · RBC · ••1234)");
  });
});
