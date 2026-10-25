import { describe, expect, it } from "vitest";
import { clearBankBalance, setBankBalance } from "@/actions/bank-balance";
import { getBankBalance } from "@/dal/bank-balance";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

describe("bank balance actions", () => {
  it("has no balance until one is entered", async () => {
    expect(await getBankBalance()).toBeNull();
  });

  it("saves a balance with the time it was entered", async () => {
    const before = Date.now();
    expect(await setBankBalance({ balance: "1,250.50" })).toEqual({ ok: true });
    const saved = await getBankBalance();
    expect(saved?.balanceCents).toBe(125_050);
    expect(new Date(saved?.updatedAt ?? 0).getTime()).toBeGreaterThanOrEqual(
      before - 1_000,
    );
  });

  it("saves an overdrawn (negative) balance", async () => {
    expect(await setBankBalance({ balance: "-123.45" })).toEqual({ ok: true });
    expect((await getBankBalance())?.balanceCents).toBe(-12_345);
  });

  it("replaces the last balance instead of adding another", async () => {
    await setBankBalance({ balance: "500" });
    await setBankBalance({ balance: "-20" });
    expect((await getBankBalance())?.balanceCents).toBe(-2_000);
    expect(await rows("select * from bank_balances")).toHaveLength(1);
  });

  it("reports a typo next to the field and saves nothing", async () => {
    const result = await setBankBalance({ balance: "12abc" });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        balance: ["Enter your balance, like 1250.00, or -75.00 if overdrawn"],
      },
    });
    expect(await getBankBalance()).toBeNull();
  });

  it("removes the balance, and removing again is fine", async () => {
    await setBankBalance({ balance: "-5" });
    expect(await clearBankBalance()).toEqual({ ok: true });
    expect(await getBankBalance()).toBeNull();
    expect(await clearBankBalance()).toEqual({ ok: true });
  });

  it("keeps each user's balance separate", async () => {
    signInAs("user_b");
    await setBankBalance({ balance: "-900" });
    signInAs("user_a");
    expect(await getBankBalance()).toBeNull();
    await setBankBalance({ balance: "40" });
    await clearBankBalance();
    signInAs("user_b");
    expect((await getBankBalance())?.balanceCents).toBe(-90_000);
  });

  it("refuses when signed out", async () => {
    signOut();
    expect(await setBankBalance({ balance: "10" })).toMatchObject({
      ok: false,
    });
    expect(await rows("select * from bank_balances")).toHaveLength(0);
  });
});
