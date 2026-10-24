import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  parseMoney,
} from "@/lib/money";

// Intl output can use narrow/non-breaking spaces; compare on plain spaces.
const plain = (value: string) => value.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("formats cents as Canadian dollars", () => {
    expect(formatMoney(123_456)).toBe("$1,234.56");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats negative amounts", () => {
    expect(plain(formatMoney(-2_500))).toMatch(/^-\$25\.00$/);
  });
});

describe("formatMoneyCompact", () => {
  it("abbreviates large amounts", () => {
    expect(formatMoneyCompact(150_000_00)).toBe("$150K");
    expect(formatMoneyCompact(1_250_000_00)).toBe("$1.3M");
    expect(formatMoneyCompact(950_00)).toBe("$950");
  });
});

describe("parseMoney", () => {
  it.each([
    ["1250", 125_000],
    ["1250.5", 125_050],
    ["1,250.55", 125_055],
    ["$1234.56", 123_456],
    [" 12 ", 1_200],
    ["0", 0],
    ["0.1", 10],
    ["19.99", 1_999],
    ["1.", 100],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each([
    "",
    "abc",
    "-5",
    "1.234",
    "1.2.3",
    ".5",
    "12abc",
    "1e3",
  ])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("rounds floating point noise to whole cents", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1.13")).toBe(113);
  });
});

describe("centsToInput", () => {
  it("turns cents into an editable two-decimal string", () => {
    expect(centsToInput(125_050)).toBe("1250.50");
    expect(centsToInput(7)).toBe("0.07");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percentage", () => {
    expect(formatPercent(0.256)).toBe("26%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(-0.1)).toBe("-10%");
  });
});
