import { leftoverSpend } from "@/lib/leftover";
import { lastDayOf } from "@/lib/month";

/*
 * "Safe to spend": what's left of this month's take-home after fixed bills and
 * spending so far, spread over the days left. Like leftover spend, it's held
 * to the money in chequing: when chequing is negative overall, nothing is
 * safe to spend. Pure, so it's easy to test.
 */

/**
 * Days left in `month` counting today, with `todayDate` as YYYY-MM-DD. A
 * future month has all its days left; a past month has none.
 */
export function daysLeftInMonth(month: string, todayDate: string): number {
  const days = Number(lastDayOf(month).slice(8));
  const todayMonth = todayDate.slice(0, 7);
  if (month < todayMonth) return 0;
  if (month > todayMonth) return days;
  return days - Number(todayDate.slice(8, 10)) + 1;
}

export type SafeToSpend = {
  /**
   * Take-home minus fixed bills and spending, held to net chequing; negative
   * when over budget, and 0 while chequing is negative.
   */
  leftCents: number;
  daysLeft: number;
  /** What can go out each remaining day; 0 when nothing is left. */
  perDayCents: number;
};

export function safeToSpend({
  incomeCents,
  spentCents,
  daysLeft,
  netChequingCents = null,
}: {
  incomeCents: number;
  spentCents: number;
  daysLeft: number;
  /** All chequing accounts combined; null (no accounts) leaves the budget as is. */
  netChequingCents?: number | null;
}): SafeToSpend {
  const { leftoverCents: leftCents } = leftoverSpend(
    incomeCents - spentCents,
    netChequingCents,
  );
  const perDayCents =
    leftCents > 0 && daysLeft > 0 ? Math.floor(leftCents / daysLeft) : 0;
  return { leftCents, daysLeft, perDayCents };
}
