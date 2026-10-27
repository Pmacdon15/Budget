import type { Category } from "@/lib/categories";
import type { ReceiptKind } from "@/lib/receipt-files";

export type FixedItem = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  dueDay: number | null;
  startMonth: string;
  endMonth: string | null;
  /** Who charges it, as it shows up on a receipt or statement. */
  merchant?: string | null;
  /** Other names a charge for this bill shows up under. */
  matchKeywords?: string[];
  /** The user guessed the amount; the first real charge replaces it. */
  isEstimate?: boolean;
  /** Ties the rows one bill is split into when its amount changes. */
  seriesId?: string;
};

export type IncomeEntry = {
  id: string;
  month: string;
  label: string;
  amountCents: number;
  receivedOn: string | null;
  /** Who paid it, when an AI recorded it from an email. */
  payer?: string | null;
  /** The receipt it came with (e.g. the e-Transfer email), if any. */
  receiptId?: string | null;
  receiptKind?: ReceiptKind | null;
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
  /** False when the receipt was read off an email and has no photo to open. */
  receiptHasPhoto?: boolean;
  /** What the receipt shows: a photo, a PDF, the email, or only details. */
  receiptKind?: ReceiptKind | null;
  /** Not paid yet, so it stays off the bank balance until it's marked paid. */
  unpaid?: boolean;
  /** The fixed bill this expense paid. It counts as that bill, not as extra spending. */
  fixedItemId?: string | null;
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
  /** ISO 4217 code the amounts are in, when the receipt says (EUR, USD, ...). */
  currency?: string;
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
