import { addMonths } from "@/lib/month";

/*
 * Tax tracking: GST (all sales tax combined, as the receipt reader saves it)
 * paid per month and per year, from saved receipts. Shared by the browser and
 * the server.
 */

/** Tax read off the receipts counted in one month. */
export type MonthTax = {
  month: string;
  taxCents: number;
  /** Receipts with a tax amount counted in this month. */
  receipts: number;
};

export type TaxSummary = {
  month: string;
  year: string;
  /** The selected month. */
  current: MonthTax;
  /** January to December of the selected month's year. */
  months: MonthTax[];
  yearTaxCents: number;
  yearReceipts: number;
};

/** The calendar year a `YYYY-MM` month falls in, as January and December. */
export function yearOf(month: string) {
  const year = month.slice(0, 4);
  return { year, from: `${year}-01`, to: `${year}-12` };
}

/** Fills in the months without receipts and totals the year. */
export function taxSummary(month: string, rows: MonthTax[]): TaxSummary {
  const { year, from } = yearOf(month);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(from, i);
    return byMonth.get(m) ?? { month: m, taxCents: 0, receipts: 0 };
  });
  const current = months.find((m) => m.month === month) ?? {
    month,
    taxCents: 0,
    receipts: 0,
  };
  return {
    month,
    year,
    current,
    months,
    yearTaxCents: months.reduce((sum, m) => sum + m.taxCents, 0),
    yearReceipts: months.reduce((sum, m) => sum + m.receipts, 0),
  };
}
