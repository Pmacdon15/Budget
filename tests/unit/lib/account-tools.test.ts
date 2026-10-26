import { describe, expect, it } from "vitest";
import {
  proposeAccountInputSchema,
  recordStatementInputSchema,
  recordTransferInputSchema,
  updateAccountBalanceInputSchema,
} from "@/lib/account-tools";
import { isPdf, newStatementPdfPathname } from "@/lib/statement-pdf";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";

describe("MCP account tool inputs", () => {
  it("proposes an account by type, institution and last four", () => {
    expect(
      proposeAccountInputSchema.safeParse({
        type: "credit_card",
        institution: "RBC",
        last_four: "1234",
      }).success,
    ).toBe(true);
    expect(
      proposeAccountInputSchema.safeParse({
        type: "credit_card",
        institution: "RBC",
        last_four: "123",
      }).success,
    ).toBe(false);
  });

  it("updates a balance by id or by institution plus last four", () => {
    expect(
      updateAccountBalanceInputSchema.safeParse({ account_id: A, balance: -12 })
        .success,
    ).toBe(true);
    expect(
      updateAccountBalanceInputSchema.safeParse({
        institution: "TD",
        last_four: "9876",
        balance: 412.08,
        as_of: "2026-10-25T14:30:00-06:00",
      }).success,
    ).toBe(true);
    expect(
      updateAccountBalanceInputSchema.safeParse({ balance: 1 }).success,
    ).toBe(false);
    expect(
      updateAccountBalanceInputSchema.safeParse({
        account_id: A,
        balance: 1,
        as_of: "yesterday",
      }).success,
    ).toBe(false);
  });

  it("records a statement with a closing date that exists", () => {
    const statement = {
      institution: "RBC",
      last_four: "1234",
      closing_date: "2026-10-15",
      balance: 842.19,
    };
    expect(recordStatementInputSchema.safeParse(statement).success).toBe(true);
    expect(
      recordStatementInputSchema.safeParse({
        ...statement,
        closing_date: "2026-02-31",
      }).success,
    ).toBe(false);
  });

  it("records a transfer between two different accounts", () => {
    const transfer = {
      from_account_id: A,
      to_account_id: B,
      amount: 842.19,
      date: "2026-10-30",
    };
    expect(recordTransferInputSchema.safeParse(transfer).success).toBe(true);
    expect(
      recordTransferInputSchema.safeParse({ ...transfer, to_account_id: A })
        .success,
    ).toBe(false);
    expect(
      recordTransferInputSchema.safeParse({ ...transfer, amount: -5 }).success,
    ).toBe(false);
  });
});

describe("statement PDFs", () => {
  it("knows a PDF by its first bytes", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
    expect(isPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toBe(false);
  });

  it("keeps each user's PDFs in their own folder, away from receipts", () => {
    expect(newStatementPdfPathname("user_a")).toMatch(
      /^statements\/user_a\/[0-9a-f-]{36}\.pdf$/,
    );
    expect(() => newStatementPdfPathname("../user_b")).toThrow();
  });
});
