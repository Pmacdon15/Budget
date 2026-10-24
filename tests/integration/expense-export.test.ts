import { inflateRawSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(app)/expenses/export/route";
import {
  insertExpense,
  insertExpenseLines,
  insertExpenseWithReceipt,
} from "@/db/expenses";
import { readReceiptImage } from "@/lib/receipt-store";
import { signOut } from "../helpers/auth";

vi.mock("@/lib/receipt-store", () => ({
  putReceiptImage: vi.fn(),
  readReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const download = (query: string) =>
  GET(new Request(`https://budget.test/expenses/export?${query}`));

const base = { month: "2026-10", spentOn: "2026-10-05" };

beforeEach(async () => {
  await insertExpenseWithReceipt(
    "user_a",
    {
      ...base,
      description: "Costco",
      category: "Groceries",
      amountCents: 11_300,
    },
    {
      imagePathname: "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg",
      merchant: "Costco Wholesale",
      purchasedOn: "2026-10-05",
      subtotalCents: 10_000,
      taxCents: 1_300,
      totalCents: 11_300,
      rawText: null,
    },
  );
  await insertExpense("user_a", {
    ...base,
    spentOn: "2026-10-12",
    description: '=HYPERLINK("x")',
    category: "Dining",
    amountCents: 4_250,
  });
  await insertExpense("user_a", {
    ...base,
    spentOn: "2026-10-15",
    description: "Movie",
    category: "Entertainment",
    amountCents: 1_800,
  });
  await insertExpense("user_b", {
    ...base,
    description: "Not mine",
    category: "Groceries",
    amountCents: 99,
  });
});

/** Reads one entry out of a ZIP the way Excel would, to check the workbook's XML. */
function unzipEntry(zip: Uint8Array, name: string): string {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let p = 0;
  while (view.getUint32(p, true) === 0x04034b50) {
    const method = view.getUint16(p + 8, true);
    const size = view.getUint32(p + 18, true);
    const nameLength = view.getUint16(p + 26, true);
    const extra = view.getUint16(p + 28, true);
    const entry = new TextDecoder().decode(
      zip.slice(p + 30, p + 30 + nameLength),
    );
    const start = p + 30 + nameLength + extra;
    const data = zip.slice(start, start + size);
    if (entry === name) {
      return new TextDecoder().decode(
        method === 8 ? inflateRawSync(data) : data,
      );
    }
    p = start + size;
  }
  throw new Error(`${name} not in archive`);
}

describe("GET /expenses/export", () => {
  it("downloads only the ticked categories as CSV", async () => {
    const response = await download(
      "format=csv&from=2026-10&to=2026-10&category=Groceries&category=Dining",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="expenses-2026-10.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.text()).split("\n")).toEqual([
      "date,description,category,amount,merchant,subtotal,tax,receipt",
      "2026-10-05,Costco,Groceries,113.00,Costco Wholesale,100.00,13.00,yes",
      // A formula from receipt text is defused rather than run by Excel.
      `2026-10-12,"'=HYPERLINK(""x"")",Dining,42.50,,,,`,
      "",
      "total,,Groceries,113.00",
      "total,,Dining,42.50",
      "total,,All,155.50",
    ]);
  });

  it("builds an Excel workbook with the rows and a category summary", async () => {
    const response = await download(
      "format=xlsx&from=2026-09&to=2026-10&category=Groceries&category=Entertainment",
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "expenses-2026-09-to-2026-10.xlsx",
    );
    const zip = new Uint8Array(await response.arrayBuffer());
    expect([...zip.slice(0, 2)]).toEqual([0x50, 0x4b]); // "PK"

    const workbook = unzipEntry(zip, "xl/workbook.xml");
    expect(workbook).toContain('name="Expenses"');
    expect(workbook).toContain('name="By category"');

    const sheet = unzipEntry(zip, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain("Costco");
    expect(sheet).toContain("Movie");
    expect(sheet).not.toContain("HYPERLINK");
    expect(sheet).not.toContain("Not mine");
    expect(sheet).toContain("<f>SUM(D2:D3)</f><v>131</v>");
  });

  it("builds a PDF, with receipt photos when asked", async () => {
    vi.mocked(readReceiptImage).mockResolvedValue(null);
    const plain = await download(
      "format=pdf&from=2026-10&to=2026-10&category=Groceries&category=Dining&category=Entertainment",
    );
    expect(plain.headers.get("Content-Type")).toBe("application/pdf");
    const doc = await PDFDocument.load(await plain.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
    expect(readReceiptImage).not.toHaveBeenCalled();

    await download(
      "format=pdf&from=2026-10&to=2026-10&category=Groceries&photos=1",
    );
    expect(readReceiptImage).toHaveBeenCalledWith(
      "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg",
    );
  });

  it("explains a bad request instead of downloading", async () => {
    const none = await download("format=csv&from=2026-10&to=2026-10");
    expect(none.status).toBe(400);
    expect(await none.text()).toBe("Pick at least one category");

    const backwards = await download(
      "format=csv&from=2026-11&to=2026-10&category=Dining",
    );
    expect(backwards.status).toBe(400);

    const bogus = await download(
      "format=docx&from=2026-10&to=2026-10&category=Dining",
    );
    expect(bogus.status).toBe(400);

    const unknownCategory = await download(
      "format=csv&from=2026-10&to=2026-10&category=Yachts",
    );
    expect(unknownCategory.status).toBe(400);
  });

  it("does not export anything when signed out", async () => {
    signOut();
    await expect(
      download("format=csv&from=2026-10&to=2026-10&category=Dining"),
    ).rejects.toMatchObject({ url: "/sign-in" });
  });

  it("prints a split receipt's photo once in a PDF", async () => {
    await insertExpenseLines(
      "user_a",
      { month: "2026-10", spentOn: "2026-10-20", description: "Superstore" },
      [
        { category: "Groceries", amountCents: 8_000 },
        { category: "Alcohol", amountCents: 3_300 },
      ],
      {
        imagePathname:
          "receipts/user_a/3c8f2d3b-0a3e-4d2f-9b4c-2e3f4a5b6c7d.jpg",
        merchant: "Superstore",
        purchasedOn: null,
        subtotalCents: null,
        taxCents: null,
        totalCents: 11_300,
        rawText: null,
      },
    );
    vi.mocked(readReceiptImage).mockResolvedValue(null);
    await download(
      "format=pdf&from=2026-10&to=2026-10&category=Groceries&category=Alcohol&photos=1",
    );
    expect(vi.mocked(readReceiptImage).mock.calls.map((c) => c[0])).toEqual([
      "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg",
      "receipts/user_a/3c8f2d3b-0a3e-4d2f-9b4c-2e3f4a5b6c7d.jpg",
    ]);
  });
});
