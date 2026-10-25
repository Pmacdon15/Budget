import { addMonths, lastDayOf, monthOfDate } from "@/lib/month";
import type { FixedItem } from "@/lib/types";

/** A fixed bill falling due on a specific date. */
export type UpcomingBill = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  /** "YYYY-MM-DD" */
  dueOn: string;
  /** 0 = today, 1 = tomorrow, ... */
  daysAway: number;
};

export const UPCOMING_DAYS = 7;

const isActiveIn = (item: FixedItem, month: string) =>
  item.startMonth <= month &&
  (item.endMonth === null || item.endMonth >= month);

/** The bill's date in a month. A due day past the month's end falls on its last day. */
function dueDateIn(month: string, dueDay: number) {
  const last = Number(lastDayOf(month).slice(8));
  return `${month}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
}

const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * Bills due from `today` through the next `days - 1` days (so 7 days counts
 * today plus six more), soonest first. Uses each bill's `due_day` only; bills
 * without one, or not running in the month they'd fall due, are left out.
 */
export function upcomingBills(
  items: FixedItem[],
  today: string,
  days = UPCOMING_DAYS,
): UpcomingBill[] {
  const start = dayNumber(today);
  const thisMonth = monthOfDate(today);
  // A 7-day window touches at most this month and the next.
  const months = [thisMonth, addMonths(thisMonth, 1)];

  const bills: UpcomingBill[] = [];
  for (const item of items) {
    if (item.dueDay == null) continue;
    for (const month of months) {
      if (!isActiveIn(item, month)) continue;
      const dueOn = dueDateIn(month, item.dueDay);
      const daysAway = dayNumber(dueOn) - start;
      if (daysAway < 0 || daysAway >= days) continue;
      bills.push({
        id: item.id,
        name: item.name,
        category: item.category,
        amountCents: item.amountCents,
        dueOn,
        daysAway,
      });
    }
  }

  return bills.sort(
    (a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name),
  );
}

/** "Today", "Tomorrow", or "In 3 days". */
export function dueLabel(daysAway: number) {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}
