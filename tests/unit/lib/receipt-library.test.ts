import { describe, expect, it } from "vitest";
import {
  containsPattern,
  parseReceiptSearch,
  RECEIPT_SEARCH_MAX_LENGTH,
  receiptSearchFrom,
} from "@/lib/schemas/receipt-library";

describe("parseReceiptSearch", () => {
  it("keeps the search text, trimmed", () => {
    expect(parseReceiptSearch("  Costco ")).toBe("Costco");
  });

  it("is empty when there's no search", () => {
    expect(parseReceiptSearch(undefined)).toBe("");
    expect(parseReceiptSearch("   ")).toBe("");
    expect(parseReceiptSearch(42)).toBe("");
  });

  it("uses the first value when the param repeats", () => {
    expect(parseReceiptSearch(["home depot", "costco"])).toBe("home depot");
  });

  it("cuts overly long text instead of failing", () => {
    const long = "a".repeat(RECEIPT_SEARCH_MAX_LENGTH + 50);
    expect(parseReceiptSearch(long)).toHaveLength(RECEIPT_SEARCH_MAX_LENGTH);
  });
});

describe("receiptSearchFrom", () => {
  it("reads ?q=", async () => {
    expect(await receiptSearchFrom(Promise.resolve({ q: "Walmart" }))).toBe(
      "Walmart",
    );
    expect(await receiptSearchFrom(Promise.resolve({}))).toBe("");
  });
});

describe("containsPattern", () => {
  it("matches the text anywhere", () => {
    expect(containsPattern("cost")).toBe("%cost%");
  });

  it("takes LIKE wildcards and backslashes literally", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
