import { describe, expect, it } from "vitest";
import { billPaymentSchema, summarizeBillsPaid } from "@/lib/bill-payments";

const ID = "11111111-1111-4111-8111-111111111111";

describe("billPaymentSchema", () => {
  it("takes a bill id and a month", () => {
    expect(
      billPaymentSchema.parse({ fixedItemId: ID, month: "2026-10" }),
    ).toEqual({ fixedItemId: ID, month: "2026-10" });
  });

  it("rejects a bad id or month", () => {
    expect(
      billPaymentSchema.safeParse({ fixedItemId: "nope", month: "2026-10" })
        .success,
    ).toBe(false);
    expect(
      billPaymentSchema.safeParse({ fixedItemId: ID, month: "2026-13" })
        .success,
    ).toBe(false);
  });
});

describe("summarizeBillsPaid", () => {
  const bills = [
    { id: "rent", amountCents: 150_000 },
    { id: "phone", amountCents: 6_500 },
    { id: "gym", amountCents: 4_000 },
  ];

  it("counts what's paid and what's still due", () => {
    expect(summarizeBillsPaid(bills, new Set(["rent"]))).toEqual({
      paidCount: 1,
      totalCount: 3,
      paidCents: 150_000,
      dueCents: 10_500,
    });
  });

  it("ignores paid marks for bills not in the list", () => {
    expect(summarizeBillsPaid(bills, new Set(["old-bill"]))).toMatchObject({
      paidCount: 0,
      dueCents: 160_500,
    });
  });

  it("is all zero with no bills", () => {
    expect(summarizeBillsPaid([], new Set())).toEqual({
      paidCount: 0,
      totalCount: 0,
      paidCents: 0,
      dueCents: 0,
    });
  });
});
