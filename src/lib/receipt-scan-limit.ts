/**
 * How many receipt scans a user may run, and the windows they're counted in.
 * Pure helpers; the counting itself is in `@/db/receipt-scans`.
 */

export const DEFAULT_SCANS_PER_HOUR = 20;
export const DEFAULT_SCANS_PER_DAY = 100;

export type ScanLimits = { perHour: number; perDay: number };
export type ScanPeriod = "hour" | "day";

type Env = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value?.trim() && Number.isInteger(n) && n > 0 ? n : fallback;
};

/** `RECEIPT_SCANS_PER_HOUR` / `RECEIPT_SCANS_PER_DAY`, or the defaults. */
export function scanLimits(env: Env = process.env): ScanLimits {
  return {
    perHour: positiveInt(env.RECEIPT_SCANS_PER_HOUR, DEFAULT_SCANS_PER_HOUR),
    perDay: positiveInt(env.RECEIPT_SCANS_PER_DAY, DEFAULT_SCANS_PER_DAY),
  };
}

/** Start and end of the UTC hour and day that `now` falls in. */
export function scanWindows(now: Date) {
  const hourStart = new Date(now);
  hourStart.setUTCMinutes(0, 0, 0);
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return {
    hour: { start: hourStart, end: new Date(hourStart.getTime() + 3_600_000) },
    day: { start: dayStart, end: new Date(dayStart.getTime() + 86_400_000) },
  };
}

/** Whole seconds until the window `period` ends, at least 1. */
export function retryAfterSeconds(now: Date, period: ScanPeriod) {
  const end = scanWindows(now)[period].end.getTime();
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

export function scanLimitMessage(period: ScanPeriod) {
  return period === "hour"
    ? "You've scanned a lot of receipts this hour. Try again in a little while, or add this one by hand."
    : "You've reached today's receipt scan limit. Try again tomorrow, or add this one by hand.";
}
