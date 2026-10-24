import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_NAMES, categoryColor } from "@/lib/categories";

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
