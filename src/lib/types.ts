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

export type FieldErrors = Partial<Record<string, string[]>>;

/** What every server action returns to the client. */
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: FieldErrors };
