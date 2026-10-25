import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveYear, yearFrom, yearSchema } from "@/lib/schemas/year-view";
import type { Expense, FixedItem, IncomeEntry } from "@/lib/types";
import {
  buildYearReport,
  periodLabel,
  shareOf,
  yearMonths,
} from "@/lib/year-view";

afterEach(() => {
  vi.useRealTimers();
});

const fixed = (
  name: string,
  amountCents: number,
  startMonth: string,
  endMonth: string | null = null,
  category = "Housing",
): FixedItem => ({
  id: name,
  name,
  category,
  amountCents,
  dueDay: 1,
  startMonth,
  endMonth,
});

const pay = (month: string, amountCents: number): IncomeEntry => ({
  id: `pay-${month}`,
  month,
  label: "Paycheque",
  amountCents,
  receivedOn: null,
});

const spend = (
  spentOn: string,
  amountCents: number,
  category = "Groceries",
): Expense => ({
  id: `${category}-${spentOn}`,
  month: spentOn.slice(0, 7),
  spentOn,
  description: category,
  category,
  amountCents,
  receiptId: null,
});

describe("yearSchema / resolveYear", () => {
  it("accepts sensible years only", () => {
    expect(yearSchema.parse("2026")).toBe(2026);
    for (const bad of ["", "abc", "1999", "2101", "2026.5"]) {
      expect(yearSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("reads ?year=, then the year of ?month=, then today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T18:00:00Z"));
    expect(resolveYear({ year: "2024", month: "2025-03" })).toBe(2024);
    expect(resolveYear({ year: ["2023", "2024"] })).toBe(2023);
    expect(resolveYear({ year: "garbage", month: "2025-03" })).toBe(2025);
    expect(resolveYear({ month: "nope" })).toBe(2026);
    expect(resolveYear({})).toBe(2026);
  });

  it("yearFrom unwraps the searchParams promise", async () => {
    expect(await yearFrom(Promise.resolve({ year: "2025" }))).toBe(2025);
  });
});

describe("yearMonths", () => {
  it("lists the whole of a past year", () => {
    expect(yearMonths(2025, "2026-10")).toHaveLength(12);
  });

  it("stops at the current month for a year in progress", () => {
    expect(yearMonths(2026, "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("is empty for a year that hasn't started", () => {
    expect(yearMonths(2027, "2026-10")).toEqual([]);
  });
});

describe("buildYearReport", () => {
  it("totals the year by month and compares the same months last year", () => {
    const report = buildYearReport(
      2026,
      "2026-03",
      [fixed("Rent", 100_000, "2025-01")],
      [
        pay("2026-01", 300_000),
        pay("2026-02", 300_000),
        pay("2026-03", 250_000),
        pay("2025-01", 280_000),
        pay("2025-02", 280_000),
        pay("2025-03", 280_000),
        pay("2025-11", 999_999), // outside the comparison months
      ],
      [
        spend("2026-01-05", 50_000),
        spend("2026-02-05", 20_000, "Dining"),
        spend("2026-03-05", 200_000),
        spend("2025-02-10", 30_000),
      ],
    );

    expect(report.months.map((m) => m.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(report.from).toBe("2026-01");
    expect(report.through).toBe("2026-03");
    expect(report.totals).toEqual({
      incomeCents: 850_000,
      fixedCents: 300_000,
      variableCents: 270_000,
      spentCents: 570_000,
      netCents: 280_000,
      activeMonths: 3,
    });
    expect(report.previous).toMatchObject({
      incomeCents: 840_000,
      fixedCents: 300_000,
      variableCents: 30_000,
      netCents: 510_000,
      activeMonths: 3,
    });
    // Best is the most left over, worst the least.
    expect(report.best?.month).toBe("2026-02");
    expect(report.worst?.month).toBe("2026-03");
    expect(report.categories).toEqual([
      { category: "Housing", totalCents: 300_000, previousCents: 300_000 },
      { category: "Groceries", totalCents: 250_000, previousCents: 30_000 },
      { category: "Dining", totalCents: 20_000, previousCents: 0 },
    ]);
  });

  it("keeps last year's categories that weren't used this year", () => {
    const report = buildYearReport(
      2026,
      "2026-12",
      [],
      [],
      [spend("2025-06-01", 4_000, "Travel")],
    );
    expect(report.categories).toEqual([
      { category: "Travel", totalCents: 0, previousCents: 4_000 },
    ]);
  });

  it("only counts bills while they're active", () => {
    const report = buildYearReport(
      2025,
      "2026-10",
      [fixed("Gym", 5_000, "2025-03", "2025-05", "Health")],
      [],
      [],
    );
    expect(report.totals.fixedCents).toBe(15_000);
    expect(report.totals.activeMonths).toBe(3);
  });

  it("has no best or worst month until two months have data", () => {
    const report = buildYearReport(
      2026,
      "2026-10",
      [],
      [pay("2026-04", 100_000)],
      [],
    );
    expect(report.best).toBeNull();
    expect(report.worst).toBeNull();
  });

  it("is empty for a year that hasn't started", () => {
    const report = buildYearReport(2027, "2026-10", [], [], []);
    expect(report.months).toEqual([]);
    expect(report.from).toBeNull();
    expect(report.totals.netCents).toBe(0);
  });
});

describe("periodLabel", () => {
  it("names a whole year by its number", () => {
    const report = { year: 2025, from: "2025-01", through: "2025-12" };
    expect(periodLabel(report)).toBe("2025");
    expect(periodLabel(report, -1)).toBe("2024");
  });

  it("names a year in progress by its months", () => {
    const report = { year: 2026, from: "2026-01", through: "2026-10" };
    expect(periodLabel(report)).toBe("Jan–Oct 2026");
    expect(periodLabel(report, -1)).toBe("Jan–Oct 2025");
    expect(
      periodLabel({ year: 2026, from: "2026-01", through: "2026-01" }),
    ).toBe("Jan 2026");
  });

  it("falls back to the year when there are no months", () => {
    expect(periodLabel({ year: 2027, from: null, through: null })).toBe("2027");
  });
});

describe("shareOf", () => {
  it("is null without take-home", () => {
    expect(shareOf(100, 0)).toBeNull();
    expect(shareOf(25, 100)).toBe(0.25);
  });
});
