import { describe, expect, it } from "vitest";
import {
  buildMerchantMemory,
  merchantKey,
  merchantMemoryResponseSchema,
  rememberedCategory,
} from "@/lib/merchant-memory";

describe("merchantKey", () => {
  it("ignores case, punctuation, accents and spacing", () => {
    expect(merchantKey("  COSTCO   Wholesale ")).toBe("costco wholesale");
    expect(merchantKey("Tim Hortons!")).toBe("tim hortons");
    expect(merchantKey("Café Démo")).toBe("cafe demo");
    expect(merchantKey("A&W")).toBe("a w");
  });

  it("drops store numbers", () => {
    expect(merchantKey("Costco Wholesale #1234")).toBe("costco wholesale");
    expect(merchantKey("Esso 4471")).toBe("esso");
    expect(merchantKey("SHELL # 12 ")).toBe("shell");
  });

  it("keeps numbers that are part of the name", () => {
    expect(merchantKey("7-Eleven")).toBe("7 eleven");
    expect(merchantKey("99")).toBe("99");
  });

  it("returns null when nothing usable is left", () => {
    expect(merchantKey("")).toBeNull();
    expect(merchantKey(null)).toBeNull();
    expect(merchantKey(undefined)).toBeNull();
    expect(merchantKey("#!")).toBeNull();
    expect(merchantKey("x")).toBeNull();
  });
});

describe("buildMerchantMemory", () => {
  it("remembers the newest category for each merchant", () => {
    expect(
      buildMerchantMemory([
        { description: "Costco", merchant: null, category: "Personal" },
        { description: "Costco", merchant: null, category: "Groceries" },
        { description: "Esso", merchant: null, category: "Transportation" },
      ]),
    ).toEqual({ costco: "Personal", esso: "Transportation" });
  });

  it("remembers both the description and the receipt's merchant", () => {
    expect(
      buildMerchantMemory([
        {
          description: "Big shop",
          merchant: "COSTCO WHOLESALE #55",
          category: "Groceries",
        },
      ]),
    ).toEqual({ "big shop": "Groceries", "costco wholesale": "Groceries" });
  });

  it("skips categories that are no longer valid", () => {
    expect(
      buildMerchantMemory([
        { description: "Costco", merchant: null, category: "Retired" },
        { description: "Costco", merchant: null, category: "Groceries" },
      ]),
    ).toEqual({ costco: "Groceries" });
  });

  it("is not fooled by names that look like object keys", () => {
    expect(
      buildMerchantMemory([
        { description: "Constructor", merchant: null, category: "Other" },
      ]),
    ).toEqual({ constructor: "Other" });
  });
});

describe("rememberedCategory", () => {
  const memory = { costco: "Groceries", esso: "Transportation" } as const;

  it("finds the first name that has a remembered category", () => {
    expect(rememberedCategory(memory, "Coffee", " ESSO #4 ")).toEqual({
      category: "Transportation",
      merchant: "ESSO #4",
    });
    expect(rememberedCategory(memory, "costco", "Esso")).toEqual({
      category: "Groceries",
      merchant: "costco",
    });
  });

  it("returns nothing for unknown merchants or before the memory loads", () => {
    expect(rememberedCategory(memory, "Shell", "", null)).toBeUndefined();
    expect(rememberedCategory(undefined, "Costco")).toBeUndefined();
    expect(rememberedCategory({}, "toString")).toBeUndefined();
  });
});

describe("merchantMemoryResponseSchema", () => {
  it("accepts the route's answer and rejects anything else", () => {
    expect(
      merchantMemoryResponseSchema.safeParse({
        merchants: { costco: "Groceries" },
      }).success,
    ).toBe(true);
    expect(
      merchantMemoryResponseSchema.safeParse({
        merchants: { costco: "Nope" },
      }).success,
    ).toBe(false);
    expect(merchantMemoryResponseSchema.safeParse({ image: "x" }).success).toBe(
      false,
    );
  });
});
