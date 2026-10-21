/** Months are handled as "YYYY-MM" strings so they sort and compare correctly. */

export const TIME_ZONE = "America/Regina";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function currentMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function resolveMonth(value: unknown) {
  return isMonth(value) ? value : currentMonth();
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

/** The `count` months ending at (and including) `end`, oldest first. */
export function monthRange(end: string, count: number) {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function monthOfDate(date: string) {
  return date.slice(0, 7);
}

export function firstDayOf(month: string) {
  return `${month}-01`;
}

export function lastDayOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}
