/**
 * The made-up month shown on the public homepage. Every total is derived from
 * the rows below, so the numbers on the page always add up.
 */

export const SAMPLE_MONTH = "October";

export type SampleIncome = {
  date: string;
  label: string;
  /** `null` while the deposit hasn't landed yet. */
  amountCents: number | null;
};

export type SampleFixed = {
  dueDay: number;
  name: string;
  category: string;
  amountCents: number;
};

export type SampleExpense = {
  date: string;
  description: string;
  category: string;
  amountCents: number;
};

export const SAMPLE_INCOME: readonly SampleIncome[] = [
  { date: "Oct 3", label: "Paycheque", amountCents: 184_216 },
  { date: "Oct 17", label: "Paycheque", amountCents: 184_216 },
  { date: "Oct 31", label: "Paycheque", amountCents: null },
];

export const SAMPLE_FIXED: readonly SampleFixed[] = [
  { dueDay: 1, name: "Rent", category: "Housing", amountCents: 145_000 },
  {
    dueDay: 8,
    name: "Car insurance",
    category: "Insurance",
    amountCents: 14_230,
  },
  { dueDay: 12, name: "Internet", category: "Utilities", amountCents: 8_000 },
  { dueDay: 15, name: "Phone", category: "Utilities", amountCents: 6_500 },
  {
    dueDay: 22,
    name: "Streaming",
    category: "Subscriptions",
    amountCents: 2_299,
  },
];

export const SAMPLE_EXPENSES: readonly SampleExpense[] = [
  {
    date: "Oct 5",
    description: "Groceries",
    category: "Groceries",
    amountCents: 31_248,
  },
  {
    date: "Oct 11",
    description: "Gas",
    category: "Transportation",
    amountCents: 9_620,
  },
  {
    date: "Oct 18",
    description: "Dinner out",
    category: "Dining",
    amountCents: 5_875,
  },
];

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

const incomeCents = sum(SAMPLE_INCOME.map((i) => i.amountCents ?? 0));
const fixedCents = sum(SAMPLE_FIXED.map((f) => f.amountCents));
const spentCents = sum(SAMPLE_EXPENSES.map((e) => e.amountCents));

export const SAMPLE_TOTALS = {
  incomeCents,
  fixedCents,
  spentCents,
  leftCents: incomeCents - fixedCents - spentCents,
} as const;

/** Share of take-home, 0–1. */
export function shareOfIncome(cents: number) {
  return SAMPLE_TOTALS.incomeCents > 0 ? cents / SAMPLE_TOTALS.incomeCents : 0;
}

/** Fixed bills and spending together, by category, largest first. */
export const SAMPLE_CATEGORIES = Object.entries(
  [...SAMPLE_FIXED, ...SAMPLE_EXPENSES].reduce<Record<string, number>>(
    (totals, row) => {
      totals[row.category] = (totals[row.category] ?? 0) + row.amountCents;
      return totals;
    },
    {},
  ),
)
  .map(([category, totalCents]) => ({ category, totalCents }))
  .sort((a, b) => b.totalCents - a.totalCents);
