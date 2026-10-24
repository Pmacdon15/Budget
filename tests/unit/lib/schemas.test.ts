import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  expenseSchema,
  fixedItemSchema,
  idSchema,
  incomeSchema,
  monthSchema,
} from "@/lib/schemas";

const errorsOf = (result: { success: boolean; error?: z.ZodError }) =>
  result.error ? z.flattenError(result.error).fieldErrors : {};

describe("monthSchema / idSchema", () => {
  it("accepts a month and rejects anything else", () => {
    expect(monthSchema.parse("2026-10")).toBe("2026-10");
    expect(monthSchema.safeParse("2026-13").success).toBe(false);
  });

  it("accepts a UUID and rejects anything else", () => {
    const id = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";
    expect(idSchema.parse(id)).toBe(id);
    const bad = idSchema.safeParse("123");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Invalid id");
  });
});

describe("fixedItemSchema", () => {
  const valid = {
    name: "  Rent ",
    category: "Housing",
    amount: "1,500.00",
    dueDay: "1",
    month: "2026-10",
  };

  it("parses form strings into typed values", () => {
    expect(fixedItemSchema.parse(valid)).toEqual({
      name: "Rent",
      category: "Housing",
      amount: 150_000,
      dueDay: 1,
      month: "2026-10",
    });
  });

  it("treats a blank or missing due day as none", () => {
    expect(fixedItemSchema.parse({ ...valid, dueDay: "" }).dueDay).toBeNull();
    const { dueDay: _omit, ...withoutDueDay } = valid;
    expect(fixedItemSchema.parse(withoutDueDay).dueDay).toBeNull();
  });

  it.each([
    ["0", "Due day must be between 1 and 31"],
    ["32", "Due day must be between 1 and 31"],
    ["2.5", "Due day must be a whole number"],
    ["abc", "Due day must be a number"],
  ])("rejects due day %j", (dueDay, message) => {
    const result = fixedItemSchema.safeParse({ ...valid, dueDay });
    expect(errorsOf(result).dueDay).toEqual([message]);
  });

  it("reports every invalid field with a friendly message", () => {
    const result = fixedItemSchema.safeParse({
      name: "   ",
      category: "Yachts",
      amount: "lots",
      month: "soon",
    });
    expect(errorsOf(result)).toEqual({
      name: ["Name is required"],
      category: ["Pick a category"],
      amount: ["Enter a valid amount, like 1250.00"],
      month: ["Invalid month"],
    });
  });

  it("limits the name length", () => {
    const result = fixedItemSchema.safeParse({
      ...valid,
      name: "x".repeat(121),
    });
    expect(errorsOf(result).name).toEqual(["Name is too long"]);
    expect(
      fixedItemSchema.safeParse({ ...valid, name: "x".repeat(120) }).success,
    ).toBe(true);
  });
});

describe("incomeSchema", () => {
  const valid = {
    label: "Paycheque",
    amount: "2500",
    month: "2026-10",
    receivedOn: "2026-10-15",
  };

  it("parses a take-home entry", () => {
    expect(incomeSchema.parse(valid)).toEqual({
      label: "Paycheque",
      amount: 250_000,
      month: "2026-10",
      receivedOn: "2026-10-15",
    });
  });

  it("makes the received date optional", () => {
    expect(incomeSchema.parse({ ...valid, receivedOn: "" }).receivedOn).toBe(
      null,
    );
    const { receivedOn: _omit, ...withoutDate } = valid;
    expect(incomeSchema.parse(withoutDate).receivedOn).toBeNull();
  });

  it("rejects a malformed date and a missing source", () => {
    const result = incomeSchema.safeParse({
      ...valid,
      label: "",
      receivedOn: "Oct 15",
    });
    expect(errorsOf(result)).toEqual({
      label: ["Source is required"],
      receivedOn: ["Pick a date"],
    });
  });
});

describe("expenseSchema", () => {
  const valid = {
    description: "Costco run",
    category: "Groceries",
    amount: "$123.45",
    spentOn: "2026-10-05",
  };

  it("parses an expense", () => {
    expect(expenseSchema.parse(valid)).toEqual({
      description: "Costco run",
      category: "Groceries",
      amount: 12_345,
      spentOn: "2026-10-05",
    });
  });

  it("requires a date", () => {
    const result = expenseSchema.safeParse({ ...valid, spentOn: "" });
    expect(errorsOf(result)).toEqual({ spentOn: ["Pick a date"] });
  });

  it("requires a description", () => {
    const result = expenseSchema.safeParse({ ...valid, description: " " });
    expect(errorsOf(result)).toEqual({
      description: ["Description is required"],
    });
  });
});
