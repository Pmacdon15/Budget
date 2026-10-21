import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { addMonths, monthRange } from "@/lib/month";

export type FixedItem = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  dueDay: number | null;
  startMonth: string;
  endMonth: string | null;
};

export type IncomeEntry = {
  id: string;
  month: string;
  label: string;
  amountCents: number;
  receivedOn: string | null;
};

export type Expense = {
  id: string;
  month: string;
  spentOn: string;
  description: string;
  category: string;
  amountCents: number;
};

export type MonthTotals = {
  month: string;
  incomeCents: number;
  fixedCents: number;
  variableCents: number;
  spentCents: number;
  netCents: number;
};

export type CategoryTotal = {
  category: string;
  fixedCents: number;
  variableCents: number;
  totalCents: number;
};

export async function requireUserId() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

function toDateString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function isActive(item: Pick<FixedItem, "startMonth" | "endMonth">, month: string) {
  return item.startMonth <= month && (item.endMonth === null || item.endMonth >= month);
}

export async function getFixedItems(userId: string): Promise<FixedItem[]> {
  const rows = await db()`
    select id, name, category, amount_cents, due_day, start_month, end_month
    from fixed_items
    where user_id = ${userId}
    order by start_month desc, name asc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    amountCents: Number(r.amount_cents),
    dueDay: r.due_day == null ? null : Number(r.due_day),
    startMonth: String(r.start_month),
    endMonth: r.end_month == null ? null : String(r.end_month),
  }));
}

export async function getIncomeBetween(
  userId: string,
  from: string,
  to: string,
): Promise<IncomeEntry[]> {
  const rows = await db()`
    select id, month, label, amount_cents, received_on
    from income
    where user_id = ${userId} and month between ${from} and ${to}
    order by month desc, received_on desc nulls last, created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    month: String(r.month),
    label: r.label,
    amountCents: Number(r.amount_cents),
    receivedOn: toDateString(r.received_on),
  }));
}

export async function getExpensesBetween(
  userId: string,
  from: string,
  to: string,
): Promise<Expense[]> {
  const rows = await db()`
    select id, month, spent_on, description, category, amount_cents
    from expenses
    where user_id = ${userId} and month between ${from} and ${to}
    order by spent_on desc, created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    month: String(r.month),
    spentOn: toDateString(r.spent_on) ?? "",
    description: r.description,
    category: r.category,
    amountCents: Number(r.amount_cents),
  }));
}

export async function getLatestIncome(userId: string): Promise<IncomeEntry | null> {
  const rows = await db()`
    select id, month, label, amount_cents, received_on
    from income
    where user_id = ${userId}
    order by month desc, created_at desc
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    month: String(r.month),
    label: r.label,
    amountCents: Number(r.amount_cents),
    receivedOn: toDateString(r.received_on),
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function totalsFor(
  month: string,
  fixed: FixedItem[],
  income: IncomeEntry[],
  expenses: Expense[],
): MonthTotals {
  const incomeCents = sum(income.filter((i) => i.month === month).map((i) => i.amountCents));
  const fixedCents = sum(fixed.filter((f) => isActive(f, month)).map((f) => f.amountCents));
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

/** Everything the dashboard and report need for one month, plus a 12-month history. */
export async function getMonthOverview(month: string, historyMonths = 12) {
  const userId = await requireUserId();
  const months = monthRange(month, historyMonths);
  const from = months[0];

  const [fixed, income, expenses] = await Promise.all([
    getFixedItems(userId),
    getIncomeBetween(userId, from, month),
    getExpensesBetween(userId, from, month),
  ]);

  const history = months.map((m) => totalsFor(m, fixed, income, expenses));
  const current = history[history.length - 1];
  const previous = history[history.length - 2] ?? totalsFor(addMonths(month, -1), [], [], []);

  // Rolling take-home: average of the last 3 months that actually have income recorded.
  const withIncome = history.filter((h) => h.incomeCents > 0).slice(-3);
  const rollingIncomeCents =
    withIncome.length > 0
      ? Math.round(sum(withIncome.map((h) => h.incomeCents)) / withIncome.length)
      : 0;

  return {
    month,
    current,
    previous,
    history,
    rollingIncomeCents,
    categories: categoryTotals(month, fixed, expenses),
    fixedItems: fixed.filter((f) => isActive(f, month)),
    income: income.filter((i) => i.month === month),
    expenses: expenses.filter((e) => e.month === month),
  };
}

export type MonthOverview = Awaited<ReturnType<typeof getMonthOverview>>;
