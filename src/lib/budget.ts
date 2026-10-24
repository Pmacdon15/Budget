import type {
  CategoryTotal,
  Expense,
  FixedItem,
  IncomeEntry,
  MonthTotals,
} from "@/lib/types";

/** Pure budget math, safe to use on the server and in the browser. */

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function isActive(
  item: Pick<FixedItem, "startMonth" | "endMonth">,
  month: string,
) {
  return (
    item.startMonth <= month &&
    (item.endMonth === null || item.endMonth >= month)
  );
}

export function totalsFor(
  month: string,
  fixed: FixedItem[],
  income: IncomeEntry[],
  expenses: Expense[],
): MonthTotals {
  const incomeCents = sum(
    income.filter((i) => i.month === month).map((i) => i.amountCents),
  );
  const fixedCents = sum(
    fixed.filter((f) => isActive(f, month)).map((f) => f.amountCents),
  );
  const variableCents = sum(
    expenses.filter((e) => e.month === month).map((e) => e.amountCents),
  );
  const spentCents = fixedCents + variableCents;
  return {
    month,
    incomeCents,
    fixedCents,
    variableCents,
    spentCents,
    netCents: incomeCents - spentCents,
  };
}

export function categoryTotals(
  month: string,
  fixed: FixedItem[],
  expenses: Expense[],
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  const get = (category: string) => {
    let entry = map.get(category);
    if (!entry) {
      entry = { category, fixedCents: 0, variableCents: 0, totalCents: 0 };
      map.set(category, entry);
    }
    return entry;
  };
  for (const item of fixed) {
    if (!isActive(item, month)) continue;
    const entry = get(item.category);
    entry.fixedCents += item.amountCents;
    entry.totalCents += item.amountCents;
  }
  for (const expense of expenses) {
    if (expense.month !== month) continue;
    const entry = get(expense.category);
    entry.variableCents += expense.amountCents;
    entry.totalCents += expense.amountCents;
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}
