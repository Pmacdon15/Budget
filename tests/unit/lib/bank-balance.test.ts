import { describe, expect, it } from "vitest";
import {
  balanceDebitLabel,
  balanceUpdatedLabel,
  bankBalanceSchema,
  isOverdrawn,
} from "@/lib/bank-balance";
import { expenseSchema, fixedItemSchema, incomeSchema } from "@/lib/schemas";

const plain = (value: string) => value.replace(/\s/g, " ");

describe("bankBalanceSchema", () => {
  it("takes a positive balance", () => {
    expect(bankBalanceSchema.parse({ balance: "1,250.50" })).toEqual({
      balance: 125_050,
    });
  });

  it("takes an overdrawn balance with a leading minus", () => {
    expect(bankBalanceSchema.parse({ balance: "-75" })).toEqual({
      balance: -7_500,
    });
    expect(bankBalanceSchema.parse({ balance: "-$123.45" })).toEqual({
      balance: -12_345,
    });
  });

  it("takes zero", () => {
    expect(bankBalanceSchema.parse({ balance: "0" })).toEqual({ balance: 0 });
  });

  it.each(["", "abc", "--5", "1.234"])("rejects %j with a hint", (balance) => {
    const result = bankBalanceSchema.safeParse({ balance });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Enter your balance, like 1250.00, or -75.00 if overdrawn",
    );
  });

  it("rejects an impossibly large balance", () => {
    const result = bankBalanceSchema.safeParse({
      balance: "-99999999999999",
    });
    expect(result.error?.issues[0]?.message).toBe("That balance is too large");
  });
});

describe("other amounts stay positive", () => {
  it("still rejects a negative expense, bill or take-home", () => {
    expect(
      expenseSchema.safeParse({
        description: "Coffee",
        category: "Food",
        amount: "-5",
        spentOn: "2026-10-25",
      }).success,
    ).toBe(false);
    expect(
      fixedItemSchema.safeParse({
        name: "Rent",
        category: "Housing",
        amount: "-5",
        month: "2026-10",
      }).success,
    ).toBe(false);
    expect(
      incomeSchema.safeParse({
        label: "Pay",
        amount: "-5",
        month: "2026-10",
      }).success,
    ).toBe(false);
  });
});

describe("isOverdrawn", () => {
  const _at = "2026-10-25T20:52:00.000Z";
  it("is true only below zero", () => {
    expect(isOverdrawn({ balanceCents: -1 })).toBe(true);
    expect(isOverdrawn({ balanceCents: 0 })).toBe(false);
    expect(isOverdrawn({ balanceCents: 1 })).toBe(false);
  });
});

describe("balanceUpdatedLabel", () => {
  it("shows when it was entered, in Regina time", () => {
    // 20:52 UTC is 2:52 p.m. in Regina (UTC−6, no daylight saving).
    expect(plain(balanceUpdatedLabel("2026-10-25T20:52:00.000Z"))).toMatch(
      /^Updated Oct 25, 2:52 p\.m\.$/,
    );
  });
});

describe("balanceDebitLabel", () => {
  it("says what was entered and what has come off since", () => {
    expect(
      plain(
        balanceDebitLabel({
          enteredCents: 100_000,
          spentSinceCents: 4_000,
          transfersSinceCents: 0,
        }) ?? "",
      ),
    ).toBe("Entered $1,000.00, less $40.00 spent since");
  });

  it("is empty when nothing has been spent or moved since", () => {
    expect(
      balanceDebitLabel({
        enteredCents: 100_000,
        spentSinceCents: 0,
        transfersSinceCents: 0,
      }),
    ).toBeNull();
  });

  it("includes transfers out and in", () => {
    expect(
      plain(
        balanceDebitLabel({
          enteredCents: 100_000,
          spentSinceCents: 4_000,
          transfersSinceCents: -25_000,
        }) ?? "",
      ),
    ).toBe(
      "Entered $1,000.00, less $40.00 spent, less $250.00 moved out since",
    );
    expect(
      plain(
        balanceDebitLabel({
          enteredCents: 100_000,
          spentSinceCents: 0,
          transfersSinceCents: 5_000,
        }) ?? "",
      ),
    ).toBe("Entered $1,000.00, plus $50.00 moved in since");
  });
});
