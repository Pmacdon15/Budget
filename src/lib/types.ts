import type { Category } from "@/lib/categories";

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
  /** The scanned receipt saved with this expense, if any. */
  receiptId: string | null;
};

/** One expense line in a download, with what was read off its receipt. */
export type ExpenseExportRow = Expense & {
  merchant: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  imagePathname: string | null;
};

/** What the AI read off a receipt photo. Every field is a suggestion. */
export type ScannedFields = {
  merchant?: string;
  purchasedOn?: string;
  totalCents?: number;
  subtotalCents?: number;
  taxCents?: number;
  category?: Category;
  rawText?: string;
  /** Set when the items span two or more categories; adds up to the total. */
  splits?: ReceiptSplit[];
};

/** One category's share of a receipt. */
export type ReceiptSplit = { category: Category; amountCents: number };

export type ScanResult = {
  recognised: boolean;
  fields: ScannedFields;
  /** True when the AI couldn't be reached, as opposed to the photo being unreadable. */
  unavailable?: boolean;
};

/** What `POST /api/receipts` answers: the stored photo's pathname plus the reading. */
export type ScanResponse = ScanResult & { image: string };

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
