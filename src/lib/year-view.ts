import { categoryTotals, sum, totalsFor } from "@/lib/budget";
import type { Expense, FixedItem, IncomeEntry, MonthTotals } from "@/lib/types";

/** Pure maths for the year view, safe on the server and in the browser. */

export type YearTotals = Omit<MonthTotals, "month"> & {
  /** Months in the period with take-home or spending recorded. */
  activeMonths: number;
};

export type YearCategory = {
  category: string;
  totalCents: number;
  /** The same months of the year before. */
  previousCents: number;
};

export type YearReport = {
  year: number;
  /** The months shown, Jan → `through` (or December for past years). */
  months: MonthTotals[];
  /** First and last month shown, or null when the year hasn't started. */
  from: string | null;
  through: string | null;
  totals: YearTotals;
  /** The same months one year earlier, for year-over-year change. */
  previous: YearTotals;
  categories: YearCategory[];
  /** Most and least left over; null until two months have data. */
  best: MonthTotals | null;
  worst: MonthTotals | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The months of `year` up to and including `through` ("YYYY-MM"), so a year
 * in progress doesn't count bills for months that haven't happened yet.
 */
export function yearMonths(year: number, through: string) {
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${pad(m)}`;
    if (month > through) break;
    months.push(month);
  }
  return months;
}

export const hasData = (m: MonthTotals) =>
  m.incomeCents > 0 || m.spentCents > 0;

function totalsOf(months: MonthTotals[]): YearTotals {
  const incomeCents = sum(months.map((m) => m.incomeCents));
  const fixedCents = sum(months.map((m) => m.fixedCents));
  const variableCents = sum(months.map((m) => m.variableCents));
  const spentCents = fixedCents + variableCents;
  return {
    incomeCents,
    fixedCents,
    variableCents,
    spentCents,
    netCents: incomeCents - spentCents,
    activeMonths: months.filter(hasData).length,
  };
}

const shiftYear = (month: string, delta: number) =>
  `${Number(month.slice(0, 4)) + delta}${month.slice(4)}`;

function categorySums(
  months: string[],
  fixed: FixedItem[],
  expenses: Expense[],
) {
  const map = new Map<string, number>();
  for (const month of months) {
    for (const c of categoryTotals(month, fixed, expenses)) {
      map.set(c.category, (map.get(c.category) ?? 0) + c.totalCents);
    }
  }
  return map;
}

/**
 * Builds the year view from the user's rows. `income` and `expenses` should
 * cover the year and the year before; anything outside is ignored.
 */
export function buildYearReport(
  year: number,
  through: string,
  fixed: FixedItem[],
  income: IncomeEntry[],
  expenses: Expense[],
): YearReport {
  const names = yearMonths(year, through);
  const previousNames = names.map((m) => shiftYear(m, -1));

  const months = names.map((m) => totalsFor(m, fixed, income, expenses));
  const previousMonths = previousNames.map((m) =>
    totalsFor(m, fixed, income, expenses),
  );

  const current = categorySums(names, fixed, expenses);
  const before = categorySums(previousNames, fixed, expenses);
  const categories = [...new Set([...current.keys(), ...before.keys()])]
    .map((category) => ({
      category,
      totalCents: current.get(category) ?? 0,
      previousCents: before.get(category) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.totalCents - a.totalCents || b.previousCents - a.previousCents,
    );

  const active = months.filter(hasData);
  let best: MonthTotals | null = null;
  let worst: MonthTotals | null = null;
  if (active.length >= 2) {
    best = active.reduce((a, m) => (m.netCents > a.netCents ? m : a));
    worst = active.reduce((a, m) => (m.netCents < a.netCents ? m : a));
  }

  return {
    year,
    months,
    from: names[0] ?? null,
    through: names[names.length - 1] ?? null,
    totals: totalsOf(months),
    previous: totalsOf(previousMonths),
    categories,
    best,
    worst,
  };
}

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, Number(month.slice(5, 7)) - 1, 1)),
  );

/**
 * The months a report covers, e.g. "Jan–Oct 2026", or just "2026" for a
 * whole year. Pass `yearOffset: -1` for the comparison period.
 */
export function periodLabel(
  report: Pick<YearReport, "year" | "from" | "through">,
  yearOffset = 0,
) {
  const year = report.year + yearOffset;
  if (!report.from || !report.through) return String(year);
  if (report.from.endsWith("-01") && report.through.endsWith("-12")) {
    return String(year);
  }
  if (report.from === report.through) {
    return `${monthName(report.from)} ${year}`;
  }
  return `${monthName(report.from)}–${monthName(report.through)} ${year}`;
}

/** The share of take-home, or null when there was none. */
export function shareOf(cents: number, incomeCents: number) {
  return incomeCents > 0 ? cents / incomeCents : null;
}
