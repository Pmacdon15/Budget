import { describe, expect, it } from "vitest";
import { taxSummary, yearOf } from "@/lib/tax";

describe("yearOf", () => {
  it("spans January to December of the month's year", () => {
    expect(yearOf("2026-10")).toEqual({
      year: "2026",
      from: "2026-01",
      to: "2026-12",
    });
  });
});

describe("taxSummary", () => {
  it("fills every month of the year and totals it", () => {
    const summary = taxSummary("2026-10", [
      { month: "2026-03", taxCents: 500, receipts: 1 },
      { month: "2026-10", taxCents: 1_300, receipts: 2 },
    ]);
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toEqual({
      month: "2026-01",
      taxCents: 0,
      receipts: 0,
    });
    expect(summary.months[11]?.month).toBe("2026-12");
    expect(summary.current).toEqual({
      month: "2026-10",
      taxCents: 1_300,
      receipts: 2,
    });
    expect(summary.yearTaxCents).toBe(1_800);
    expect(summary.yearReceipts).toBe(3);
    expect(summary.year).toBe("2026");
  });

  it("is all zeros without receipts", () => {
    const summary = taxSummary("2025-02", []);
    expect(summary.current).toEqual({
      month: "2025-02",
      taxCents: 0,
      receipts: 0,
    });
    expect(summary.yearTaxCents).toBe(0);
    expect(summary.yearReceipts).toBe(0);
  });

  it("ignores rows outside the year", () => {
    const summary = taxSummary("2026-01", [
      { month: "2025-12", taxCents: 900, receipts: 1 },
    ]);
    expect(summary.yearTaxCents).toBe(0);
  });
});
