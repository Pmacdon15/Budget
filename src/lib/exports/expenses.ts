import "server-only";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import { CATEGORY_NAMES, categoryLabel as labelOf } from "@/lib/categories";
import { buildXlsx, type Cell, XLSX_CONTENT_TYPE } from "@/lib/exports/xlsx";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import type { ExpenseExportInput } from "@/lib/schemas";
import type { ExpenseExportRow } from "@/lib/types";

/**
 * Builds the expense download in the three formats. Pure apart from
 * `loadPhoto`, which the route passes in so photos come from the blob store
 * (and tests can hand in bytes).
 */

export type ExportFile = {
  body: Uint8Array;
  contentType: string;
  filename: string;
};

export type ExportOptions = {
  /** Reads a receipt photo's JPEG bytes; only used for a PDF with photos. */
  loadPhoto?: (pathname: string) => Promise<Uint8Array | null>;
  now?: Date;
};

/** Most photos one PDF will carry, so a huge range can't time the function out. */
export const MAX_PDF_PHOTOS = 150;

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function exportFilename(filters: ExpenseExportInput) {
  const range =
    filters.from === filters.to
      ? filters.from
      : `${filters.from}-to-${filters.to}`;
  return `expenses-${range}.${filters.format}`;
}

export function rangeLabel(filters: ExpenseExportInput) {
  return filters.from === filters.to
    ? monthLabel(filters.from)
    : `${monthLabel(filters.from)} – ${monthLabel(filters.to)}`;
}

export function categoryLabel(filters: ExpenseExportInput) {
  return filters.categories.length === CATEGORY_NAMES.length
    ? "All categories"
    : filters.categories.map(labelOf).join(", ");
}

/** Spending per category, largest first, only for categories that have any. */
export function totalsByCategory(rows: ExpenseExportRow[]) {
  const totals = new Map<string, { count: number; cents: number }>();
  for (const row of rows) {
    const entry = totals.get(row.category) ?? { count: 0, cents: 0 };
    entry.count += 1;
    entry.cents += row.amountCents;
    totals.set(row.category, entry);
  }
  return [...totals]
    .map(([category, t]) => ({ category, ...t }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
}

const grandTotal = (rows: ExpenseExportRow[]) =>
  rows.reduce((sum, r) => sum + r.amountCents, 0);

export async function buildExpenseExport(
  rows: ExpenseExportRow[],
  filters: ExpenseExportInput,
  options: ExportOptions = {},
): Promise<ExportFile> {
  const filename = exportFilename(filters);
  if (filters.format === "csv") {
    return {
      body: new TextEncoder().encode(buildCsv(rows)),
      contentType: "text/csv; charset=utf-8",
      filename,
    };
  }
  if (filters.format === "xlsx") {
    return {
      body: buildSpreadsheet(rows, filters, options.now),
      contentType: XLSX_CONTENT_TYPE,
      filename,
    };
  }
  return {
    body: await buildPdf(rows, filters, options),
    contentType: "application/pdf",
    filename,
  };
}

/* ---------- CSV ---------- */

/**
 * Quotes where needed, and defuses text a spreadsheet would run as a formula
 * (receipt text is AI output, so it is not trusted to be harmless).
 */
export function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(rows: ExpenseExportRow[]) {
  const lines: (string | number)[][] = [
    [
      "date",
      "description",
      "category",
      "amount",
      "merchant",
      "subtotal",
      "tax",
      "receipt",
    ],
    ...rows.map((r) => [
      r.spentOn,
      r.description,
      labelOf(r.category),
      dollars(r.amountCents),
      r.merchant ?? "",
      r.subtotalCents === null ? "" : dollars(r.subtotalCents),
      r.taxCents === null ? "" : dollars(r.taxCents),
      r.receiptId ? "yes" : "",
    ]),
    [],
    ...totalsByCategory(rows).map((t) => [
      "total",
      "",
      labelOf(t.category),
      dollars(t.cents),
    ]),
    ["total", "", "All", dollars(grandTotal(rows))],
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}

/* ---------- Excel ---------- */

export function buildSpreadsheet(
  rows: ExpenseExportRow[],
  filters: ExpenseExportInput,
  now = new Date(),
) {
  const header: Cell[] = [
    "Date",
    "Description",
    "Category",
    "Amount",
    "Merchant",
    "Subtotal",
    "Tax",
    "Receipt",
  ].map((value) => ({ value, style: "header" }));
  const last = rows.length + 1; // last data row, 1-based

  const expenses: Cell[][] = [
    header,
    ...rows.map((r): Cell[] => [
      { date: r.spentOn },
      r.description,
      labelOf(r.category),
      { value: r.amountCents / 100, style: "money" },
      r.merchant ?? null,
      r.subtotalCents === null
        ? null
        : { value: r.subtotalCents / 100, style: "money" },
      r.taxCents === null ? null : { value: r.taxCents / 100, style: "money" },
      r.receiptId ? "Yes" : null,
    ]),
    [],
    [
      { value: "Total", style: "bold" },
      null,
      null,
      {
        formula: rows.length ? `SUM(D2:D${last})` : "0",
        value: grandTotal(rows) / 100,
        style: "moneyBold",
      },
    ],
  ];

  const byCategory: Cell[][] = [
    [{ value: "Expenses", style: "title" }],
    [
      {
        value: `${rangeLabel(filters)} · ${categoryLabel(filters)}`,
        style: "muted",
      },
    ],
    [],
    ["Category", "Expenses", "Total"].map((value) => ({
      value,
      style: "header",
    })),
    ...totalsByCategory(rows).map((t): Cell[] => [
      labelOf(t.category),
      { value: t.count, style: "integer" },
      { value: t.cents / 100, style: "money" },
    ]),
    [
      { value: "All", style: "bold" },
      { value: rows.length, style: "integer" },
      { value: grandTotal(rows) / 100, style: "moneyBold" },
    ],
  ];

  return buildXlsx(
    [
      {
        name: "Expenses",
        columns: [12, 34, 16, 12, 24, 12, 10, 9],
        rows: expenses,
        freezeRows: 1,
        autoFilterRow: 0,
        landscape: true,
      },
      { name: "By category", columns: [22, 12, 14], rows: byCategory },
    ],
    { title: `Expenses — ${rangeLabel(filters)}`, modified: now },
  );
}

/* ---------- PDF ---------- */

const PAGE = { width: 612, height: 792 }; // US Letter, points
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.86);

/**
 * The standard PDF fonts only cover Windows-1252. Receipt text can be anything,
 * so accents are folded, common punctuation mapped, and the rest dropped
 * rather than letting pdf-lib throw halfway through a document.
 */
export function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "");
}

type Column = { label: string; width: number; align?: "right" };

class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  /** Starts a new page when fewer than `height` points remain. */
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  text(
    value: string,
    x: number,
    {
      size = 10,
      font = this.font,
      color = INK,
      width,
      align,
    }: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      width?: number;
      align?: "right";
    } = {},
  ) {
    let text = pdfText(value);
    if (width !== undefined) text = fit(text, font, size, width);
    const drawX =
      align === "right" && width !== undefined
        ? x + width - font.widthOfTextAtSize(text, size)
        : x;
    this.page.drawText(text, { x: drawX, y: this.y, size, font, color });
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
  }

  row(columns: Column[], values: string[], font = this.font) {
    this.ensure(16);
    let x = MARGIN;
    columns.forEach((column, i) => {
      this.text(values[i] ?? "", x, {
        font,
        width: column.width - 6,
        align: column.align,
      });
      x += column.width;
    });
    this.y -= 15;
  }

  table(columns: Column[], rows: string[][]) {
    const header = () => {
      this.row(
        columns,
        columns.map((c) => c.label),
        this.bold,
      );
      this.y += 4;
      this.rule();
      this.y -= 12;
    };
    this.ensure(40);
    header();
    for (const values of rows) {
      if (this.y - 16 < MARGIN) {
        this.newPage();
        header();
      }
      this.row(columns, values);
    }
  }
}

/** Trims `text` with an ellipsis until it fits `width`. */
function fit(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}...`, size) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

export async function buildPdf(
  rows: ExpenseExportRow[],
  filters: ExpenseExportInput,
  { loadPhoto, now = new Date() }: ExportOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Expenses — ${pdfText(rangeLabel(filters))}`);
  doc.setCreator("Budget");
  doc.setCreationDate(now);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.text("Expenses", MARGIN, { size: 20, font: bold });
  w.y -= 20;
  w.text(rangeLabel(filters), MARGIN, { size: 11, color: MUTED });
  w.y -= 14;
  w.text(categoryLabel(filters), MARGIN, {
    size: 9,
    color: MUTED,
    width: PAGE.width - 2 * MARGIN,
  });
  w.y -= 26;

  w.text(
    `${formatMoney(grandTotal(rows))} across ${rows.length} ${rows.length === 1 ? "expense" : "expenses"}`,
    MARGIN,
    {
      size: 13,
      font: bold,
    },
  );
  w.y -= 24;

  if (rows.length === 0) {
    w.text("No expenses match these filters.", MARGIN, { color: MUTED });
  } else {
    w.table(
      [
        { label: "Category", width: 300 },
        { label: "Expenses", width: 80, align: "right" },
        { label: "Total", width: 136, align: "right" },
      ],
      totalsByCategory(rows).map((t) => [
        labelOf(t.category),
        String(t.count),
        formatMoney(t.cents),
      ]),
    );
    w.y -= 18;

    w.table(
      [
        { label: "Date", width: 70 },
        { label: "Description", width: 196 },
        { label: "Category", width: 96 },
        { label: "Tax", width: 64, align: "right" },
        { label: "Amount", width: 90, align: "right" },
      ],
      rows.map((r) => [
        r.spentOn,
        r.receiptId ? `${r.description} *` : r.description,
        labelOf(r.category),
        r.taxCents === null ? "" : formatMoney(r.taxCents),
        formatMoney(r.amountCents),
      ]),
    );
    w.y -= 4;
    w.rule();
    w.y -= 14;
    w.row(
      [
        { label: "", width: 426 },
        { label: "", width: 90, align: "right" },
      ],
      ["Total", formatMoney(grandTotal(rows))],
      bold,
    );
    if (rows.some((r) => r.receiptId)) {
      w.y -= 4;
      w.text("* Scanned receipt on file", MARGIN, { size: 8, color: MUTED });
    }
  }

  if (filters.photos && loadPhoto) {
    await addPhotos(w, rows, loadPhoto);
  }

  return doc.save();
}

/** One receipt photo per page, captioned, scaled to fit. */
async function addPhotos(
  w: Writer,
  rows: ExpenseExportRow[],
  loadPhoto: (pathname: string) => Promise<Uint8Array | null>,
) {
  // A split receipt is several rows sharing one photo; print it once, with
  // the parts' combined amount and every category it was split into.
  const parts = new Map<string, { cents: number; categories: string[] }>();
  for (const r of rows) {
    if (!r.imagePathname) continue;
    const entry = parts.get(r.imagePathname) ?? { cents: 0, categories: [] };
    entry.cents += r.amountCents;
    entry.categories.push(labelOf(r.category));
    parts.set(r.imagePathname, entry);
  }
  const seen = new Set<string>();
  const withPhotos = rows
    .filter((r) => {
      if (!r.imagePathname || seen.has(r.imagePathname)) return false;
      seen.add(r.imagePathname);
      return true;
    })
    .slice(0, MAX_PDF_PHOTOS);
  for (const row of withPhotos) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await loadPhoto(row.imagePathname as string);
    } catch (error) {
      console.error("loading a receipt photo for the PDF failed", error);
    }
    if (!bytes) continue;

    let image: Awaited<ReturnType<PDFDocument["embedJpg"]>>;
    try {
      image = await w.doc.embedJpg(bytes);
    } catch {
      continue; // not a JPEG we can embed; the line item is still listed
    }

    w.newPage();
    w.text(`${row.spentOn} · ${row.description}`, MARGIN, {
      size: 12,
      font: w.bold,
      width: PAGE.width - 2 * MARGIN - 110,
    });
    const part = parts.get(row.imagePathname as string);
    w.text(
      formatMoney(part?.cents ?? row.amountCents),
      PAGE.width - MARGIN - 110,
      {
        size: 12,
        font: w.bold,
        width: 110,
        align: "right",
      },
    );
    w.y -= 16;
    w.text((part?.categories ?? [labelOf(row.category)]).join(", "), MARGIN, {
      size: 9,
      color: MUTED,
      width: PAGE.width - 2 * MARGIN,
    });
    w.y -= 14;

    const maxWidth = PAGE.width - 2 * MARGIN;
    const maxHeight = w.y - MARGIN;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    w.page.drawImage(image, {
      x: MARGIN + (maxWidth - width) / 2,
      y: w.y - height,
      width,
      height,
    });
  }
}
