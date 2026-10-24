import type { Expense, FixedItem, IncomeEntry } from "@/lib/types";

let next = 0;
const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

export const fixedItem = (overrides: Partial<FixedItem> = {}): FixedItem => ({
  id: id(),
  name: "Rent",
  category: "Housing",
  amountCents: 150_000,
  dueDay: 1,
  startMonth: "2026-01",
  endMonth: null,
  ...overrides,
});

export const incomeEntry = (
  overrides: Partial<IncomeEntry> = {},
): IncomeEntry => ({
  id: id(),
  month: "2026-10",
  label: "Paycheque",
  amountCents: 250_000,
  receivedOn: "2026-10-15",
  ...overrides,
});

export const expense = (overrides: Partial<Expense> = {}): Expense => ({
  id: id(),
  month: "2026-10",
  spentOn: "2026-10-05",
  description: "Costco run",
  category: "Groceries",
  amountCents: 12_345,
  ...overrides,
});
