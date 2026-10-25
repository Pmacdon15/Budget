import { lastDayOf } from "@/lib/month";

/*
 * "Safe to spend": what's left of this month's take-home after fixed bills and
 * spending so far, spread over the days left. Pure, so it's easy to test.
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
  /** Take-home minus fixed bills and spending; negative when over. */
  leftCents: number;
  daysLeft: number;
  /** What can go out each remaining day; 0 when nothing is left. */
  perDayCents: number;
};

export function safeToSpend({
  incomeCents,
  spentCents,
  daysLeft,
}: {
  incomeCents: number;
  spentCents: number;
  daysLeft: number;
}): SafeToSpend {
  const leftCents = incomeCents - spentCents;
  const perDayCents =
    leftCents > 0 && daysLeft > 0 ? Math.floor(leftCents / daysLeft) : 0;
  return { leftCents, daysLeft, perDayCents };
}
