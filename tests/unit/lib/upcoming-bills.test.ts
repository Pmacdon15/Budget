import { describe, expect, it } from "vitest";
import type { FixedItem } from "@/lib/types";
import { dueLabel, upcomingBills } from "@/lib/upcoming-bills";

const bill = (overrides: Partial<FixedItem> = {}): FixedItem => ({
  id: overrides.name ?? "rent",
  name: "Rent",
  category: "Housing",
  amountCents: 150_000,
  dueDay: 1,
  startMonth: "2026-01",
  endMonth: null,
  ...overrides,
});

const names = (items: FixedItem[], today: string) =>
  upcomingBills(items, today).map((b) => `${b.name} ${b.dueOn} +${b.daysAway}`);

describe("upcomingBills", () => {
  it("lists bills due from today through the next six days, soonest first", () => {
    const items = [
      bill({ name: "Phone", dueDay: 20 }),
      bill({ name: "Rent", dueDay: 14 }),
      bill({ name: "Gym", dueDay: 15 }),
      bill({ name: "Too late", dueDay: 21 }),
      bill({ name: "Already paid", dueDay: 13 }),
    ];
    expect(names(items, "2026-10-14")).toEqual([
      "Rent 2026-10-14 +0",
      "Gym 2026-10-15 +1",
      "Phone 2026-10-20 +6",
    ]);
  });

  it("wraps into next month", () => {
    const items = [
      bill({ name: "Rent", dueDay: 1 }),
      bill({ name: "Insurance", dueDay: 30 }),
    ];
    expect(names(items, "2026-10-28")).toEqual([
      "Insurance 2026-10-30 +2",
      "Rent 2026-11-01 +4",
    ]);
  });

  it("wraps across the new year", () => {
    expect(names([bill({ dueDay: 2 })], "2026-12-29")).toEqual([
      "Rent 2027-01-02 +4",
    ]);
  });

  it("moves a due day past the month's end to its last day", () => {
    expect(names([bill({ name: "Card", dueDay: 31 })], "2027-02-25")).toEqual([
      "Card 2027-02-28 +3",
    ]);
  });

  it("skips bills without a due day", () => {
    expect(names([bill({ dueDay: null })], "2026-10-01")).toEqual([]);
  });

  it("only counts months the bill is running in", () => {
    const items = [
      bill({ name: "Ends", dueDay: 2, endMonth: "2026-10" }),
      bill({ name: "Starts", dueDay: 2, startMonth: "2026-11" }),
      bill({ name: "Ended", dueDay: 30, endMonth: "2026-09" }),
    ];
    expect(names(items, "2026-10-28")).toEqual(["Starts 2026-11-02 +5"]);
  });

  it("sorts bills due the same day by name", () => {
    const items = [bill({ name: "Water" }), bill({ name: "Hydro" })];
    expect(names(items, "2026-11-01")).toEqual([
      "Hydro 2026-11-01 +0",
      "Water 2026-11-01 +0",
    ]);
  });
});

describe("dueLabel", () => {
  it("reads naturally", () => {
    expect(dueLabel(0)).toBe("Today");
    expect(dueLabel(1)).toBe("Tomorrow");
    expect(dueLabel(5)).toBe("In 5 days");
  });
});
