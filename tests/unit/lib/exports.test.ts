import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { CATEGORY_NAMES } from "@/lib/categories";
import {
  buildExpenseExport,
  buildPdf,
  categoryLabel,
  csvCell,
  exportFilename,
  pdfText,
  rangeLabel,
  totalsByCategory,
} from "@/lib/exports/expenses";
import type { ExpenseExportInput } from "@/lib/schemas";
import type { ExpenseExportRow } from "@/lib/types";

const filters = (
  over: Partial<ExpenseExportInput> = {},
): ExpenseExportInput => ({
  format: "csv",
  from: "2026-10",
  to: "2026-10",
  categories: ["Groceries"],
  photos: false,
  ...over,
});

const row = (over: Partial<ExpenseExportRow> = {}): ExpenseExportRow => ({
  id: crypto.randomUUID(),
  month: "2026-10",
  spentOn: "2026-10-05",
  description: "Costco",
  category: "Groceries",
  amountCents: 1_000,
  receiptId: null,
  merchant: null,
  subtotalCents: null,
  taxCents: null,
  imagePathname: null,
  ...over,
});

describe("export labels", () => {
  it("names the file after the range and format", () => {
    expect(exportFilename(filters())).toBe("expenses-2026-10.csv");
    expect(exportFilename(filters({ from: "2026-01", format: "pdf" }))).toBe(
      "expenses-2026-01-to-2026-10.pdf",
    );
  });

  it("describes the range and categories", () => {
    expect(rangeLabel(filters())).toBe("October 2026");
    expect(rangeLabel(filters({ from: "2026-01" }))).toBe(
      "January 2026 – October 2026",
    );
    expect(categoryLabel(filters({ categories: ["Dining", "Health"] }))).toBe(
      "Meals & Dining, Health",
    );
    expect(categoryLabel(filters({ categories: [...CATEGORY_NAMES] }))).toBe(
      "All categories",
    );
  });
});

describe("totalsByCategory", () => {
  it("adds up per category, largest first", () => {
    expect(
      totalsByCategory([
        row({ category: "Dining", amountCents: 500 }),
        row({ category: "Groceries", amountCents: 700 }),
        row({ category: "Dining", amountCents: 400 }),
      ]),
    ).toEqual([
      { category: "Dining", count: 2, cents: 900 },
      { category: "Groceries", count: 1, cents: 700 },
    ]);
  });
});

describe("csvCell", () => {
  it("quotes and defuses where needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    // Numbers are ours, not user text, so a minus sign stays a minus sign.
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("pdfText", () => {
  it("keeps the standard fonts from choking on receipt text", () => {
    expect(pdfText("Café “Olé” — 2 × 3…")).toBe('Cafe "Ole" - 2 × 3...');
    expect(pdfText("寿司 Sushi 🍣")).toBe(" Sushi ");
  });
});

describe("buildPdf", () => {
  it("lays out many rows across pages", async () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      row({
        description: `Item ${i} with a rather long name that must be cut short`,
        receiptId: i % 2 ? "r" : null,
      }),
    );
    const doc = await PDFDocument.load(
      await buildPdf(rows, filters({ format: "pdf" })),
    );
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(doc.getTitle()).toBe("Expenses — October 2026");
  });

  it("handles no matching expenses", async () => {
    const doc = await PDFDocument.load(
      await buildPdf([], filters({ format: "pdf" })),
    );
    expect(doc.getPageCount()).toBe(1);
  });

  it("skips photos that are missing or not JPEGs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loadPhoto = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockRejectedValueOnce(new Error("gone"));
    const rows = [
      row({ imagePathname: "a.jpg" }),
      row({ imagePathname: "b.jpg" }),
      row({ imagePathname: "c.jpg" }),
      row(),
    ];
    const bytes = await buildPdf(
      rows,
      filters({ format: "pdf", photos: true }),
      {
        loadPhoto,
      },
    );
    expect(loadPhoto).toHaveBeenCalledTimes(3);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("buildExpenseExport", () => {
  it("picks the content type for each format", async () => {
    const types = await Promise.all(
      (["csv", "xlsx", "pdf"] as const).map(
        async (format) =>
          (await buildExpenseExport([row()], filters({ format }))).contentType,
      ),
    );
    expect(types).toEqual([
      "text/csv; charset=utf-8",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/pdf",
    ]);
  });
});
