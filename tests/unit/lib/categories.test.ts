import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_NAMES,
  categoryColor,
  categoryLabel,
  isCategory,
} from "@/lib/categories";

describe("categories", () => {
  it("has unique names, each with a color", () => {
    expect(new Set(CATEGORY_NAMES).size).toBe(CATEGORIES.length);
    expect(CATEGORY_NAMES).toEqual(CATEGORIES.map((c) => c.name));
    for (const category of CATEGORIES) {
      expect(category.color).toMatch(/^oklch\(/);
    }
  });

  it("includes an Other fallback", () => {
    expect(CATEGORY_NAMES).toContain("Other");
  });

  it("looks up a category's color", () => {
    expect(categoryColor("Housing")).toBe(
      CATEGORIES.find((c) => c.name === "Housing")?.color,
    );
  });

  it("uses the Other color for unknown categories", () => {
    expect(categoryColor("Yachts")).toBe(categoryColor("Other"));
  });
});

describe("spending categories", () => {
  it("covers car costs, alcohol and food on the go", () => {
    expect(CATEGORY_NAMES).toEqual(
      expect.arrayContaining(["Auto", "Alcohol", "Food"]),
    );
  });

  it("describes every category for the receipt reader", () => {
    for (const category of CATEGORIES) {
      expect(category.hint.length).toBeGreaterThan(5);
    }
  });

  it("recognises category names", () => {
    expect(isCategory("Alcohol")).toBe(true);
    expect(isCategory("alcohol")).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });
});

describe("category labels", () => {
  it("keeps every stored name that saved expenses already use", () => {
    // Renaming one of these would orphan rows in the database; change the
    // label instead.
    expect(CATEGORY_NAMES).toEqual(
      expect.arrayContaining([
        "Housing",
        "Utilities",
        "Transportation",
        "Auto",
        "Insurance",
        "Debt",
        "Subscriptions",
        "Groceries",
        "Food",
        "Dining",
        "Alcohol",
        "Health",
        "Personal",
        "Entertainment",
        "Savings",
        "Other",
      ]),
    );
  });

  it("gives every category a unique label", () => {
    const labels = CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("words labels like the CRA business-expense lines", () => {
    expect(categoryLabel("Auto")).toBe("Motor Vehicle");
    expect(categoryLabel("Dining")).toBe("Meals & Dining");
    expect(categoryLabel("Office")).toBe("Office & Supplies");
    expect(categoryLabel("Professional")).toBe("Professional Fees");
    expect(categoryLabel("Advertising")).toBe("Advertising");
  });

  it("falls back to the stored name for unknown categories", () => {
    expect(categoryLabel("Yachts")).toBe("Yachts");
  });
});
