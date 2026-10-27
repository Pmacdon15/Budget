import { z } from "zod";
import { formatMoney, parseSignedMoney } from "@/lib/money";
import { TIME_ZONE } from "@/lib/month";

/*
 * The user's current bank balance: the primary chequing account's, the one
 * expenses come off, as they last typed it in (or a bank alert reported it).
 * It can be below zero, for an overdrawn account. Shared by browser and
 * server.
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
  /** The primary chequing account this balance is. */
  accountId: string;
  accountName: string;
  /**
   * What's in the account now: the entered balance less the expenses added
   * since, adjusted by transfers since, plus take-home deposited since.
   * Below zero when overdrawn.
   */
  balanceCents: number;
  /** The balance as the user (or their AI) last entered it. */
  enteredCents: number;
  /** Expenses added after it was entered, which have come off it. */
  spentSinceCents: number;
  /** Transfers since it was entered: positive when money came in. */
  transfersSinceCents: number;
  /** Take-home deposited into it since it was entered. */
  depositsSinceCents?: number;
  /** When it was last entered, as an ISO timestamp. */
  updatedAt: string;
};

export const isOverdrawn = (balance: Pick<BankBalance, "balanceCents">) =>
  balance.balanceCents < 0;

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

/**
 * "Entered $1,250.00, less $80.00 spent since", or null when nothing has been
 * spent since it was entered (the balance is just what was typed).
 */
export function balanceDebitLabel(
  balance: Pick<
    BankBalance,
    | "enteredCents"
    | "spentSinceCents"
    | "transfersSinceCents"
    | "depositsSinceCents"
  >,
) {
  const transfers = balance.transfersSinceCents;
  const deposits = balance.depositsSinceCents ?? 0;
  if (balance.spentSinceCents === 0 && transfers === 0 && deposits === 0) {
    return null;
  }
  const parts = [
    balance.spentSinceCents !== 0
      ? `less ${formatMoney(balance.spentSinceCents)} spent`
      : null,
    transfers < 0 ? `less ${formatMoney(-transfers)} moved out` : null,
    transfers > 0 ? `plus ${formatMoney(transfers)} moved in` : null,
    deposits > 0 ? `plus ${formatMoney(deposits)} deposited` : null,
  ].filter(Boolean);
  return `Entered ${formatMoney(balance.enteredCents)}, ${parts.join(", ")} since`;
}
