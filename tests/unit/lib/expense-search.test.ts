import { describe, expect, it } from "vitest";
import {
  EMPTY_SEARCH,
  expenseSearchFrom,
  expenseSearchQuery,
  isSearching,
  parseExpenseSearch,
  SEARCH_TEXT_MAX,
} from "@/lib/schemas/expense-search";

describe("parseExpenseSearch", () => {
  it("reads nothing as no search", () => {
    expect(parseExpenseSearch({})).toEqual(EMPTY_SEARCH);
    expect(isSearching(parseExpenseSearch({ month: "2026-10" }))).toBe(false);
  });

  it("reads text, category, amounts and scope", () => {
    expect(
      parseExpenseSearch({
        q: "  costco ",
        category: "Groceries",
        min: "10",
        max: "$1,250.50",
        scope: "all",
      }),
    ).toEqual({
      q: "costco",
      category: "Groceries",
      minCents: 1_000,
      maxCents: 125_050,
      allMonths: true,
    });
  });

  it("drops bad values instead of failing", () => {
    expect(
      parseExpenseSearch({
        category: "Yachts",
        min: "abc",
        max: "-5",
        scope: "forever",
      }),
    ).toEqual(EMPTY_SEARCH);
  });

  it("uses the first of repeated parameters", () => {
    expect(
      parseExpenseSearch({ q: ["gas", "food"], category: ["Auto", "Dining"] }),
    ).toMatchObject({ q: "gas", category: "Auto" });
  });

  it("swaps a range typed back to front", () => {
    expect(parseExpenseSearch({ min: "50", max: "20" })).toMatchObject({
      minCents: 2_000,
      maxCents: 5_000,
    });
  });

  it("cuts very long search text", () => {
    const { q } = parseExpenseSearch({ q: "x".repeat(500) });
    expect(q).toHaveLength(SEARCH_TEXT_MAX);
  });

  it("counts any filter as searching", () => {
    expect(isSearching({ ...EMPTY_SEARCH, q: "a" })).toBe(true);
    expect(isSearching({ ...EMPTY_SEARCH, category: "Auto" })).toBe(true);
    expect(isSearching({ ...EMPTY_SEARCH, minCents: 0 })).toBe(true);
    expect(isSearching({ ...EMPTY_SEARCH, maxCents: 100 })).toBe(true);
    expect(isSearching({ ...EMPTY_SEARCH, allMonths: true })).toBe(true);
  });

  it("reads the page's searchParams promise", async () => {
    await expect(
      expenseSearchFrom(Promise.resolve({ q: "pizza" })),
    ).resolves.toMatchObject({ q: "pizza" });
  });
});

describe("expenseSearchQuery", () => {
  it("keeps the month and sets only the filters that have values", () => {
    expect(
      expenseSearchQuery("?month=2026-09", {
        q: " costco ",
        category: "Groceries",
        min: "",
        max: "100",
        scope: "month",
      }),
    ).toBe("month=2026-09&q=costco&category=Groceries&max=100");
  });

  it("leaves out 'all categories' and replaces an earlier search", () => {
    expect(
      expenseSearchQuery("month=2026-09&q=old&min=5&scope=all", {
        q: "new",
        category: "all",
      }),
    ).toBe("month=2026-09&q=new");
  });

  it("clears every filter", () => {
    expect(
      expenseSearchQuery("q=old&category=Auto&min=1&max=2&scope=all", {}),
    ).toBe("");
  });

  it("asks for all months", () => {
    expect(expenseSearchQuery("", { scope: "all" })).toBe("scope=all");
  });
});
