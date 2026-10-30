import { describe, expect, it, vi } from "vitest";
import {
  buildExportManifest,
  type ExpenditureRow,
  exportZipFilename,
  isIsoDate,
  MAX_EXPORT_RECEIPTS,
  periodLabel,
  planExpenditures,
  presetRange,
  receiptCopyUrl,
  receiptExportHref,
  receiptExportSchema,
  receiptExtension,
  summaryFilename,
  tooManyReceiptsMessage,
} from "@/lib/receipt-export";
import {
  buildExportZip,
  MISSING_LIST,
  NothingToExportError,
} from "@/lib/receipt-export-zip";
import { readZip } from "../../helpers/zip";

const ID_A = "2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c";
const ID_B = "7c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f";

const row = (over: Partial<ExpenditureRow> = {}): ExpenditureRow => ({
  id: crypto.randomUUID(),
  kind: "expense",
  date: "2026-10-05",
  description: "Costco",
  category: "Groceries",
  amountCents: 1_000,
  merchant: "Costco Wholesale",
  subtotalCents: null,
  taxCents: null,
  unpaid: false,
  account: null,
  receiptId: null,
  receiptKind: null,
  receiptFileName: null,
  ...over,
});

const text = (value: string) => new TextEncoder().encode(value);

describe("receipt export choices", () => {
  it("accepts only real calendar days", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-10")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("builds the manifest URL, keeping formats in a fixed order", () => {
    expect(
      receiptExportHref({
        from: "2026-01-01",
        to: "2026-03-31",
        formats: ["pdf", "csv"],
      }),
    ).toEqual({
      href: "/api/receipts/export?from=2026-01-01&to=2026-03-31&format=csv&format=pdf",
    });
    // No summary at all is allowed: receipts only.
    expect(
      receiptExportHref({ from: "2026-01-01", to: "2026-01-01", formats: [] }),
    ).toEqual({ href: "/api/receipts/export?from=2026-01-01&to=2026-01-01" });
  });

  it("explains choices it can't use", () => {
    expect(
      receiptExportHref({ from: "2026-03-01", to: "2026-01-01", formats: [] }),
    ).toEqual({ error: "The start date must come before the end date" });
    expect(
      receiptExportHref({ from: "", to: "2026-01-01", formats: [] }),
    ).toEqual({ error: "Pick a start date" });
    expect(
      receiptExportSchema.safeParse({
        from: "2026-01-01",
        to: "2026-01-02",
        formats: ["docx"],
      }).success,
    ).toBe(false);
  });

  it("names the zip and summaries after the period", () => {
    const range = { from: "2026-01-01", to: "2026-03-31" };
    expect(exportZipFilename(range)).toBe(
      "expenditures-2026-01-01-to-2026-03-31.zip",
    );
    expect(summaryFilename(range, "xlsx")).toBe(
      "expenditures-2026-01-01-to-2026-03-31.xlsx",
    );
    expect(exportZipFilename({ from: "2026-05-04", to: "2026-05-04" })).toBe(
      "expenditures-2026-05-04.zip",
    );
    expect(periodLabel(range)).toBe("Jan 1, 2026 – Mar 31, 2026");
  });

  it("works out the quick periods in the app's time zone", () => {
    // 3am UTC on Nov 1 is still Oct 31 in Regina.
    const now = new Date("2026-11-01T03:00:00Z");
    expect(presetRange("this-month", now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(presetRange("last-month", now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("this-year", now)).toEqual({
      from: "2026-01-01",
      to: "2026-10-31",
    });
    expect(presetRange("last-year", now)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(presetRange("last-month", new Date("2026-01-15T18:00:00Z"))).toEqual(
      { from: "2025-12-01", to: "2025-12-31" },
    );
  });

  it("asks for a shorter period past the limit", () => {
    expect(tooManyReceiptsMessage()).toContain(String(MAX_EXPORT_RECEIPTS));
  });
});

describe("planExpenditures", () => {
  it("gives each receipt copy one safe, unique name with the right extension", () => {
    const planned = planExpenditures([
      // A split receipt: two parts, one photo.
      row({ receiptId: ID_A, receiptKind: "photo", category: "Groceries" }),
      row({ receiptId: ID_A, receiptKind: "photo", category: "Health" }),
      row({
        receiptId: ID_B,
        receiptKind: "email",
        merchant: "../../Shaw / Rogers",
        date: "2026-10-07",
      }),
      row({ description: "No receipt" }),
      row({
        receiptId: "11111111-2222-4333-8444-555555555555",
        receiptKind: "details",
      }),
    ]);
    expect(planned.map((p) => p.receiptFile)).toEqual([
      "receipts/2026-10-05_Costco-Wholesale_2b7e1c2a.jpg",
      "receipts/2026-10-05_Costco-Wholesale_2b7e1c2a.jpg",
      "receipts/2026-10-07_Shaw-Rogers_7c9d0e1f.html",
      null,
      // Only details were read off it: nothing to put in the zip.
      null,
    ]);
  });

  it("keeps an uploaded file's extension and falls back to the description", () => {
    const [planned] = planExpenditures([
      row({
        receiptId: ID_A,
        receiptKind: "file",
        receiptFileName: "Invoice 42.DOCX",
        merchant: null,
        description: "Lawn mower",
      }),
    ]);
    expect(planned.receiptFile).toBe(
      "receipts/2026-10-05_Lawn-mower_2b7e1c2a.docx",
    );
    expect(receiptExtension("file", null)).toBe("bin");
    expect(receiptExtension("pdf", "x.jpg")).toBe("pdf");
    expect(receiptExtension(null, null)).toBeNull();
  });

  it("points each copy at its owner-checked route, emails at their own", () => {
    expect(receiptCopyUrl(ID_A, "photo")).toBe(`/api/receipts/${ID_A}/file`);
    expect(receiptCopyUrl(ID_A, "pdf")).toBe(`/api/receipts/${ID_A}/file`);
    expect(receiptCopyUrl(ID_A, "email")).toBe(`/api/receipts/${ID_A}/email`);
  });

  it("lists summaries first, then each receipt once", () => {
    const planned = planExpenditures([
      row({ receiptId: ID_A, receiptKind: "pdf" }),
      row({ receiptId: ID_A, receiptKind: "pdf" }),
      row({ receiptId: ID_B, receiptKind: "email" }),
    ]);
    const manifest = buildExportManifest(planned, {
      from: "2026-10-01",
      to: "2026-10-31",
      formats: ["csv", "pdf"],
    });
    expect(manifest).toEqual({
      filename: "expenditures-2026-10-01-to-2026-10-31.zip",
      summaries: [
        {
          filename: "expenditures-2026-10-01-to-2026-10-31.csv",
          url: "/api/receipts/export/summary?from=2026-10-01&to=2026-10-31&format=csv",
        },
        {
          filename: "expenditures-2026-10-01-to-2026-10-31.pdf",
          url: "/api/receipts/export/summary?from=2026-10-01&to=2026-10-31&format=pdf",
        },
      ],
      receipts: [
        {
          filename: "receipts/2026-10-05_Costco-Wholesale_2b7e1c2a.pdf",
          url: `/api/receipts/${ID_A}/file`,
        },
        {
          filename: "receipts/2026-10-05_Costco-Wholesale_7c9d0e1f.html",
          url: `/api/receipts/${ID_B}/email`,
        },
      ],
      expenditureCount: 3,
    });
  });
});

describe("buildExportZip", () => {
  const manifest = {
    filename: "expenditures-2026-10-01-to-2026-10-31.zip",
    summaries: [{ filename: "summary.csv", url: "/summary.csv" }],
    receipts: [
      { filename: "receipts/a.jpg", url: "/a" },
      { filename: "receipts/b.html", url: "/b" },
    ],
    expenditureCount: 3,
  };

  it("zips the summaries at the top and receipts in their folder", async () => {
    const files: Record<string, string> = {
      "/summary.csv": "date,amount",
      "/a": "photo",
      "/b": "<p>email</p>",
    };
    const progress = vi.fn();
    const zip = await buildExportZip("/manifest", {
      fetch: async (url) =>
        url === "/manifest"
          ? Response.json(manifest)
          : new Response(files[url]),
      onProgress: progress,
    });

    expect(zip.filename).toBe(manifest.filename);
    expect(zip.receipts).toBe(2);
    expect(zip.skipped).toBe(0);
    const entries = readZip(new Uint8Array(await zip.blob.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual([
      "summary.csv",
      "receipts/a.jpg",
      "receipts/b.html",
    ]);
    expect(new TextDecoder().decode(entries[2].data)).toBe("<p>email</p>");
    expect(progress).toHaveBeenLastCalledWith({ done: 3, total: 3 });
  });

  it("lists receipts it couldn't fetch instead of failing", async () => {
    const zip = await buildExportZip("/manifest", {
      fetch: async (url) => {
        if (url === "/manifest") return Response.json(manifest);
        if (url === "/a") throw new TypeError("network");
        if (url === "/b") return new Response("gone", { status: 404 });
        return new Response(text("csv"));
      },
    });
    expect(zip.skipped).toBe(2);
    const entries = readZip(new Uint8Array(await zip.blob.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual(["summary.csv", MISSING_LIST]);
    const list = new TextDecoder().decode(entries[1].data);
    expect(list).toContain("receipts/a.jpg");
    expect(list).toContain("receipts/b.html");
  });

  it("fails when a summary can't be built", async () => {
    await expect(
      buildExportZip("/manifest", {
        fetch: async (url) =>
          url === "/manifest"
            ? Response.json(manifest)
            : Response.json({ error: "Summary broke" }, { status: 500 }),
      }),
    ).rejects.toThrow("Summary broke");
  });

  it("fails when there's nothing it could download at all", async () => {
    await expect(
      buildExportZip("/manifest", {
        fetch: async (url) =>
          url === "/manifest"
            ? Response.json({ ...manifest, summaries: [] })
            : new Response("", { status: 404 }),
      }),
    ).rejects.toThrow("Couldn't download any of the receipts");
  });

  it("says when nothing was spent, and shows the server's errors", async () => {
    await expect(
      buildExportZip("/manifest", {
        fetch: async () =>
          Response.json({ ...manifest, expenditureCount: 0, receipts: [] }),
      }),
    ).rejects.toBeInstanceOf(NothingToExportError);
    await expect(
      buildExportZip("/manifest", {
        fetch: async () =>
          Response.json({ error: "Too many" }, { status: 413 }),
      }),
    ).rejects.toThrow("Too many");
  });
});
