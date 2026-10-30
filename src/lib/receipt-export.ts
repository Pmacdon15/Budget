import { z } from "zod";
import {
  addMonths,
  currentMonth,
  firstDayOf,
  lastDayOf,
  today,
} from "@/lib/month";
import { fileExtension, type ReceiptKind } from "@/lib/receipt-files";
import { dedupeNames, sanitizeName } from "@/lib/receipt-photos";

/*
 * "Download receipts" on the Receipts page: every expenditure in a date
 * range, as one .zip holding a copy of each receipt (photo, PDF, saved email
 * or uploaded file) plus a summary of all the spending as CSV, Excel and/or
 * PDF. The server lists what goes in (a manifest) and builds the summaries;
 * the browser fetches each file through its owner-checked route and zips them
 * itself, like the receipt-photo zip. Shared by the browser and the server.
 */

/** Most receipt copies one zip will carry; past this, pick a shorter period. */
export const MAX_EXPORT_RECEIPTS = 500;

/** The summary formats that can go at the top of the zip. */
export const SUMMARY_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number];

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A real calendar day as `YYYY-MM-DD` (no Feb 30th). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const isoDate = (message: string) => z.string().refine(isIsoDate, message);

/** The period: `?from=YYYY-MM-DD&to=YYYY-MM-DD`, both days included. */
export const receiptExportRangeSchema = z
  .object({
    from: isoDate("Pick a start date"),
    to: isoDate("Pick an end date"),
  })
  .refine((v) => v.from <= v.to, {
    message: "The start date must come before the end date",
    path: ["to"],
  });

/** The manifest's query: the period plus the summaries to include. */
export const receiptExportSchema = z
  .object({
    from: isoDate("Pick a start date"),
    to: isoDate("Pick an end date"),
    formats: z
      .array(z.enum(SUMMARY_FORMATS, { error: "Pick a file type" }))
      .transform((list) => SUMMARY_FORMATS.filter((f) => list.includes(f))),
  })
  .refine((v) => v.from <= v.to, {
    message: "The start date must come before the end date",
    path: ["to"],
  });

/** One summary file: `?from=…&to=…&format=csv|xlsx|pdf`. */
export const receiptExportSummarySchema = z
  .object({
    from: isoDate("Pick a start date"),
    to: isoDate("Pick an end date"),
    format: z.enum(SUMMARY_FORMATS, { error: "Pick a file type" }),
  })
  .refine((v) => v.from <= v.to, {
    message: "The start date must come before the end date",
    path: ["to"],
  });

export type ReceiptExportRange = z.output<typeof receiptExportRangeSchema>;
export type ReceiptExportInput = z.output<typeof receiptExportSchema>;
export type ReceiptExportSummaryInput = z.output<
  typeof receiptExportSummarySchema
>;

/**
 * One expenditure in the period, as the database hands it over: an expense,
 * or a fixed bill marked paid. A split receipt is one row per part, sharing
 * the receipt.
 */
export type ExpenditureRow = {
  id: string;
  kind: "expense" | "bill";
  date: string;
  description: string;
  category: string;
  amountCents: number;
  merchant: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  /** An expense not paid yet (an order waiting on a transfer, say). */
  unpaid: boolean;
  account: string | null;
  receiptId: string | null;
  /** What the receipt's saved copy is; "details" when there's nothing to open. */
  receiptKind: ReceiptKind | null;
  /** An uploaded file's original name, for its extension. */
  receiptFileName: string | null;
};

/** A row with the name its receipt copy has in the zip (null: none). */
export type PlannedExpenditure = ExpenditureRow & {
  receiptFile: string | null;
};

/** One file to fetch into the zip. `url` is always an owner-checked route. */
export type ReceiptExportEntry = { filename: string; url: string };

export type ReceiptExportManifest = {
  filename: string;
  /** The summaries, which go at the top of the zip. */
  summaries: ReceiptExportEntry[];
  /** Receipt copies, under `receipts/`. */
  receipts: ReceiptExportEntry[];
  expenditureCount: number;
};

/** Every failure comes back as JSON in this shape, never as a file. */
export type ReceiptExportError = { error: string };

export const RECEIPTS_FOLDER = "receipts";

export function tooManyReceiptsMessage() {
  return `That's more than ${MAX_EXPORT_RECEIPTS} receipts. Pick a shorter period.`;
}

const range = (r: ReceiptExportRange) =>
  r.from === r.to ? r.from : `${r.from}-to-${r.to}`;

export const exportZipFilename = (r: ReceiptExportRange) =>
  `expenditures-${range(r)}.zip`;

export const summaryFilename = (r: ReceiptExportRange, format: SummaryFormat) =>
  `expenditures-${range(r)}.${format}`;

/** "Jan 1, 2026 – Mar 31, 2026", for summary headings. */
export function periodLabel(r: ReceiptExportRange) {
  const format = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  return r.from === r.to
    ? format(r.from)
    : `${format(r.from)} – ${format(r.to)}`;
}

/** The extension a receipt copy is saved with, or null when there's no copy. */
export function receiptExtension(
  kind: ReceiptKind | null,
  fileName: string | null,
): string | null {
  switch (kind) {
    case "photo":
      return "jpg";
    case "pdf":
      return "pdf";
    case "email":
      return "html";
    case "file":
      return fileExtension(fileName) ?? "bin";
    default:
      return null;
  }
}

/** The owner-checked route serving a receipt's copy. Emails have their own. */
export function receiptCopyUrl(receiptId: string, kind: ReceiptKind) {
  const id = encodeURIComponent(receiptId);
  return kind === "email"
    ? `/api/receipts/${id}/email`
    : `/api/receipts/${id}/file`;
}

/**
 * Names every receipt copy once (a split receipt is several rows sharing one
 * copy): `receipts/YYYY-MM-DD_merchant_<short id>.<ext>`, unique within the
 * zip. The summaries and the zip use this same plan, so a summary's "Receipt
 * file" column names the file next to it.
 */
export function planExpenditures(
  rows: readonly ExpenditureRow[],
): PlannedExpenditure[] {
  const firstById = new Map<string, ExpenditureRow>();
  for (const row of rows) {
    if (!row.receiptId || firstById.has(row.receiptId)) continue;
    if (!receiptExtension(row.receiptKind, row.receiptFileName)) continue;
    firstById.set(row.receiptId, row);
  }
  const ids = [...firstById.keys()];
  const names = dedupeNames(
    ids.map((id) => {
      const row = firstById.get(id) as ExpenditureRow;
      const name = sanitizeName(row.merchant?.trim() || row.description);
      const shortId = id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "receipt";
      const date = isIsoDate(row.date) ? row.date : "undated";
      const ext = receiptExtension(row.receiptKind, row.receiptFileName);
      return `${date}_${name}_${shortId}.${ext}`;
    }),
  );
  const nameById = new Map(
    ids.map((id, i) => [id, `${RECEIPTS_FOLDER}/${names[i]}`]),
  );
  return rows.map((row) => ({
    ...row,
    receiptFile: row.receiptId ? (nameById.get(row.receiptId) ?? null) : null,
  }));
}

/** The receipt copies to fetch, one per receipt, in the order of the rows. */
export function receiptEntries(
  planned: readonly PlannedExpenditure[],
): ReceiptExportEntry[] {
  const seen = new Set<string>();
  const entries: ReceiptExportEntry[] = [];
  for (const row of planned) {
    if (!row.receiptFile || !row.receiptId || !row.receiptKind) continue;
    if (seen.has(row.receiptId)) continue;
    seen.add(row.receiptId);
    entries.push({
      filename: row.receiptFile,
      url: receiptCopyUrl(row.receiptId, row.receiptKind),
    });
  }
  return entries;
}

export function summaryHref(r: ReceiptExportRange, format: SummaryFormat) {
  const params = new URLSearchParams({ from: r.from, to: r.to, format });
  return `/api/receipts/export/summary?${params}`;
}

/** The manifest for a period: summaries first, then each receipt copy. */
export function buildExportManifest(
  planned: readonly PlannedExpenditure[],
  input: ReceiptExportInput,
): ReceiptExportManifest {
  return {
    filename: exportZipFilename(input),
    summaries: input.formats.map((format) => ({
      filename: summaryFilename(input, format),
      url: summaryHref(input, format),
    })),
    receipts: receiptEntries(planned),
    expenditureCount: planned.length,
  };
}

/** The manifest URL for these choices, or the reason they can't be used. */
export function receiptExportHref(choices: {
  from: string;
  to: string;
  formats: SummaryFormat[];
}): { href: string } | { error: string } {
  const parsed = receiptExportSchema.safeParse(choices);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your choices" };
  }
  const params = new URLSearchParams({
    from: parsed.data.from,
    to: parsed.data.to,
  });
  for (const format of parsed.data.formats) params.append("format", format);
  return { href: `/api/receipts/export?${params}` };
}

/* ---------- Quick periods ---------- */

export const PERIOD_PRESETS = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-year", label: "This year" },
  { id: "last-year", label: "Last year" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["id"];

/** The days a quick period covers, in the app's time zone. */
export function presetRange(
  preset: PeriodPreset,
  now = new Date(),
): ReceiptExportRange {
  const month = currentMonth(now);
  const year = Number(month.slice(0, 4));
  switch (preset) {
    case "this-month":
      return { from: firstDayOf(month), to: today(now) };
    case "last-month": {
      const last = addMonths(month, -1);
      return { from: firstDayOf(last), to: lastDayOf(last) };
    }
    case "this-year":
      return { from: `${year}-01-01`, to: today(now) };
    case "last-year":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}
