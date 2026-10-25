import { z } from "zod";
import { parseSignedMoney } from "@/lib/money";
import { TIME_ZONE } from "@/lib/month";

/*
 * The user's current bank balance, as they last typed it in. It's the one
 * amount in the app allowed below zero, for an overdrawn account. Shared by
 * browser and server.
 */

/** $1 trillion either way: far past any real balance, and exact as a JS number. */
const LIMIT_CENTS = 100_000_000_000_000;

const balance = z.string().transform((value, ctx) => {
  const cents = parseSignedMoney(value);
  if (cents === null) {
    ctx.addIssue({
      code: "custom",
      message: "Enter your balance, like 1250.00, or -75.00 if overdrawn",
    });
    return z.NEVER;
  }
  if (Math.abs(cents) > LIMIT_CENTS) {
    ctx.addIssue({ code: "custom", message: "That balance is too large" });
    return z.NEVER;
  }
  return cents;
});

export const bankBalanceSchema = z.object({ balance });

export type BankBalanceFormValues = z.input<typeof bankBalanceSchema>;
export type BankBalanceInput = z.output<typeof bankBalanceSchema>;

export type BankBalance = {
  /** Below zero when the account is overdrawn. */
  balanceCents: number;
  /** When it was last entered, as an ISO timestamp. */
  updatedAt: string;
};

export const isOverdrawn = (balance: BankBalance) => balance.balanceCents < 0;

/** "Updated Oct 25, 2:52 p.m." in the app's time zone. */
export function balanceUpdatedLabel(updatedAt: string) {
  const when = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(updatedAt));
  return `Updated ${when}`;
}
