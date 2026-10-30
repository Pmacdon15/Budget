import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { categoryLabel } from "@/lib/categories";
import { toCsv } from "@/lib/exports/csv";
import {
  type ExportFile,
  MARGIN,
  MUTED,
  PAGE,
  pdfText,
  totalsByCategory,
  Writer,
} from "@/lib/exports/expenses";
import { buildXlsx, type Cell, XLSX_CONTENT_TYPE } from "@/lib/exports/xlsx";
import { formatMoney } from "@/lib/money";
import {
  type PlannedExpenditure,
  periodLabel,
  type ReceiptExportRange,
  type SummaryFormat,
  summaryFilename,
} from "@/lib/receipt-export";

/**
 * The summary at the top of the receipts .zip: every expenditure in the
 * period (expenses and paid fixed bills) as CSV, Excel or PDF, each row
 * naming its receipt's file in the zip's `receipts/` folder.
 */

const dollars = (cents: number) => (cents / 100).toFixed(2);

const typeLabel = (row: PlannedExpenditure) =>
  row.kind === "bill" ? "Fixed bill" : "Expense";

const statusLabel = (row: PlannedExpenditure) =>
  row.unpaid ? "Unpaid" : "Paid";

const total = (rows: readonly PlannedExpenditure[]) =>
  rows.reduce((sum, r) => sum + r.amountCents, 0);

export async function buildExpenditureSummary(
  rows: PlannedExpenditure[],
  range: ReceiptExportRange,
  format: SummaryFormat,
  now = new Date(),
): Promise<ExportFile> {
  const filename = summaryFilename(range, format);
  if (format === "csv") {
    return {
      body: new TextEncoder().encode(buildExpenditureCsv(rows)),
      contentType: "text/csv; charset=utf-8",
      filename,
    };
  }
  if (format === "xlsx") {
    return {
      body: buildExpenditureSpreadsheet(rows, range, now),
      contentType: XLSX_CONTENT_TYPE,
      filename,
    };
  }
  return {
    body: await buildExpenditurePdf(rows, range, now),
    contentType: "application/pdf",
    filename,
  };
}

/* ---------- CSV ---------- */

export function buildExpenditureCsv(rows: readonly PlannedExpenditure[]) {
  const lines: (string | number)[][] = [
    [
      "date",
      "type",
      "description",
      "merchant",
      "category",
      "account",
      "status",
      "subtotal",
      "tax",
      "amount",
      "receipt file",
    ],
    ...rows.map((r) => [
      r.date,
      typeLabel(r),
      r.description,
      r.merchant ?? "",
      categoryLabel(r.category),
      r.account ?? "",
      statusLabel(r),
      r.subtotalCents === null ? "" : dollars(r.subtotalCents),
      r.taxCents === null ? "" : dollars(r.taxCents),
      dollars(r.amountCents),
      r.receiptFile ?? "",
    ]),
    [],
    ...totalsByCategory(rows).map((t) => [
      "total",
      "",
      "",
      "",
      categoryLabel(t.category),
      "",
      "",
      "",
      "",
      dollars(t.cents),
    ]),
    ["total", "", "", "", "All", "", "", "", "", dollars(total(rows))],
  ];
  return toCsv(lines);
}

/* ---------- Excel ---------- */

export function buildExpenditureSpreadsheet(
  rows: readonly PlannedExpenditure[],
  range: ReceiptExportRange,
  now = new Date(),
) {
  const header: Cell[] = [
    "Date",
    "Type",
    "Description",
    "Merchant",
    "Category",
    "Account",
    "Status",
    "Subtotal",
    "Tax",
    "Amount",
    "Receipt file",
  ].map((value) => ({ value, style: "header" }));
  const last = rows.length + 1; // last data row, 1-based
  const money = (cents: number | null): Cell =>
    cents === null ? null : { value: cents / 100, style: "money" };

  const expenditures: Cell[][] = [
    header,
    ...rows.map((r): Cell[] => [
      { date: r.date },
      typeLabel(r),
      r.description,
      r.merchant ?? null,
      categoryLabel(r.category),
      r.account ?? null,
      statusLabel(r),
      money(r.subtotalCents),
      money(r.taxCents),
      money(r.amountCents),
      r.receiptFile ?? null,
    ]),
    [],
    [
      { value: "Total", style: "bold" },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      {
        formula: rows.length ? `SUM(J2:J${last})` : "0",
        value: total(rows) / 100,
        style: "moneyBold",
      },
    ],
  ];

  const byCategory: Cell[][] = [
    [{ value: "Expenditures", style: "title" }],
    [{ value: periodLabel(range), style: "muted" }],
    [],
    ["Category", "Items", "Total"].map((value) => ({
      value,
      style: "header",
    })),
    ...totalsByCategory(rows).map((t): Cell[] => [
      categoryLabel(t.category),
      { value: t.count, style: "integer" },
      { value: t.cents / 100, style: "money" },
    ]),
    [
      { value: "All", style: "bold" },
      { value: rows.length, style: "integer" },
      { value: total(rows) / 100, style: "moneyBold" },
    ],
  ];

  return buildXlsx(
    [
      {
        name: "Expenditures",
        columns: [12, 11, 30, 22, 16, 18, 9, 11, 10, 12, 44],
        rows: expenditures,
        freezeRows: 1,
        autoFilterRow: 0,
        landscape: true,
      },
      { name: "By category", columns: [22, 10, 14], rows: byCategory },
    ],
    { title: `Expenditures — ${periodLabel(range)}`, modified: now },
  );
}

/* ---------- PDF ---------- */

export async function buildExpenditurePdf(
  rows: readonly PlannedExpenditure[],
  range: ReceiptExportRange,
  now = new Date(),
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Expenditures — ${pdfText(periodLabel(range))}`);
  doc.setCreator("Budget");
  doc.setCreationDate(now);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.text("Expenditures", MARGIN, { size: 20, font: bold });
  w.y -= 20;
  w.text(periodLabel(range), MARGIN, { size: 11, color: MUTED });
  w.y -= 26;

  const count = rows.length;
  w.text(
    `${formatMoney(total(rows))} across ${count} ${count === 1 ? "item" : "items"}`,
    MARGIN,
    { size: 13, font: bold },
  );
  w.y -= 24;

  if (count === 0) {
    w.text("Nothing was spent in this period.", MARGIN, { color: MUTED });
    return doc.save();
  }

  w.table(
    [
      { label: "Category", width: 300 },
      { label: "Items", width: 80, align: "right" },
      { label: "Total", width: 136, align: "right" },
    ],
    totalsByCategory(rows).map((t) => [
      categoryLabel(t.category),
      String(t.count),
      formatMoney(t.cents),
    ]),
  );
  w.y -= 18;

  w.table(
    [
      { label: "Date", width: 64 },
      { label: "Description", width: 170 },
      { label: "Category", width: 86 },
      { label: "Account", width: 80 },
      { label: "Tax", width: 52, align: "right" },
      { label: "Amount", width: 64, align: "right" },
    ],
    rows.map((r) => {
      const notes = [
        r.kind === "bill" ? "bill" : null,
        r.unpaid ? "unpaid" : null,
      ].filter(Boolean);
      const label = notes.length
        ? `${r.description} (${notes.join(", ")})`
        : r.description;
      return [
        r.date,
        r.receiptFile ? `${label} *` : label,
        categoryLabel(r.category),
        r.account ?? "",
        r.taxCents === null ? "" : formatMoney(r.taxCents),
        formatMoney(r.amountCents),
      ];
    }),
  );
  w.y -= 4;
  w.rule();
  w.y -= 14;
  w.row(
    [
      { label: "", width: 452 },
      { label: "", width: 64, align: "right" },
    ],
    ["Total", formatMoney(total(rows))],
    bold,
  );
  if (rows.some((r) => r.receiptFile)) {
    w.y -= 4;
    w.text("* Receipt copy in the receipts folder of this download", MARGIN, {
      size: 8,
      color: MUTED,
      width: PAGE.width - 2 * MARGIN,
    });
  }

  return doc.save();
}
