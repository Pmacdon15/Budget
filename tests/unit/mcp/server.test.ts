import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MCP_INSTRUCTIONS } from "@/mcp/instructions";
import { callerFrom, registerBudgetTools, SERVER_OPTIONS } from "@/mcp/server";

// The tools' database work is covered by tests/integration/mcp.
vi.mock("@/mcp/account-tools", () => ({
  listAccounts: vi.fn(),
  proposeAccount: vi.fn(),
  recordStatement: vi.fn(),
  recordTransfer: vi.fn(),
  updateAccountBalance: vi.fn(),
}));
vi.mock("@/mcp/tools", () => ({
  addExpense: vi.fn(),
  addFixedBill: vi.fn(),
  attachReceipt: vi.fn(),
  convertExpenseToFixedBill: vi.fn(),
  deleteExpense: vi.fn(),
  editExpense: vi.fn(),
  editFixedBill: vi.fn(),
  findMatchingFixedBill: vi.fn(),
  listCategories: vi.fn(),
  listExpenses: vi.fn(),
  listFixedBills: vi.fn(),
  markBillPaid: vi.fn(),
  markExpensePaid: vi.fn(),
  syncBankBalance: vi.fn(),
  unlinkFixedBill: vi.fn(),
}));

type Registered = {
  name: string;
  config: {
    description?: string;
    inputSchema?: unknown;
    annotations?: Record<string, boolean>;
  };
};

function registered() {
  const tools: Registered[] = [];
  const server = {
    registerTool: (name: string, config: Registered["config"]) => {
      tools.push({ name, config });
    },
    server: { getClientVersion: () => undefined },
  };
  registerBudgetTools(server as never);
  return new Map(tools.map((t) => [t.name, t.config]));
}

const tools = registered();

describe("Budget MCP server", () => {
  it("exposes exactly the tools in the spec", () => {
    expect([...tools.keys()].sort()).toEqual([
      "add_expense",
      "add_fixed_bill",
      "attach_receipt",
      "convert_expense_to_fixed_bill",
      "delete_expense",
      "edit_expense",
      "edit_fixed_bill",
      "find_matching_fixed_bill",
      "list_accounts",
      "list_categories",
      "list_expenses",
      "list_fixed_bills",
      "mark_bill_paid",
      "mark_expense_paid",
      "propose_account",
      "record_statement",
      "record_transfer",
      "sync_bank_balance",
      "unlink_fixed_bill",
      "update_account_balance",
    ]);
  });

  it("describes every tool", () => {
    for (const [name, config] of tools) {
      expect(config.description?.length, name).toBeGreaterThan(40);
    }
  });

  it("marks the read helpers read-only", () => {
    for (const name of [
      "list_categories",
      "list_expenses",
      "list_fixed_bills",
      "list_accounts",
    ]) {
      expect(tools.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it("marks edit and delete as destructive, so clients ask first", () => {
    for (const name of ["edit_expense", "delete_expense"]) {
      expect(tools.get(name)?.annotations?.destructiveHint, name).toBe(true);
      expect(tools.get(name)?.description, name).toMatch(/explicitly asks/);
    }
  });

  it("marks a fixed bill edit as destructive, needing the user's OK", () => {
    expect(tools.get("edit_fixed_bill")?.annotations?.destructiveHint).toBe(
      true,
    );
    expect(tools.get("edit_fixed_bill")?.description).toMatch(/get their OK/);
  });

  it("only adds a fixed bill for a charge that clearly repeats, or when asked", () => {
    expect(tools.get("add_fixed_bill")?.description).toMatch(
      /clearly says the charge repeats.*or the user asks/,
    );
  });

  it("doesn't mark adding, syncing or marking paid as destructive", () => {
    for (const name of [
      "add_expense",
      "sync_bank_balance",
      "mark_expense_paid",
      "mark_bill_paid",
      "attach_receipt",
      "add_fixed_bill",
      "propose_account",
      "update_account_balance",
      "record_statement",
      "record_transfer",
    ]) {
      expect(tools.get(name)?.annotations?.readOnlyHint, name).toBe(false);
      expect(tools.get(name)?.annotations?.destructiveHint, name).toBe(false);
    }
  });

  it("takes arguments for every tool that needs them", () => {
    for (const name of [
      "add_expense",
      "sync_bank_balance",
      "edit_expense",
      "delete_expense",
      "list_expenses",
      "propose_account",
      "update_account_balance",
      "record_statement",
      "record_transfer",
    ]) {
      expect(tools.get(name)?.inputSchema, name).toBeDefined();
    }
  });
});

describe("server instructions", () => {
  it("are sent to every client", () => {
    expect(SERVER_OPTIONS.instructions).toBe(MCP_INSTRUCTIONS);
    expect(SERVER_OPTIONS.serverInfo.name).toBe("budget");
  });

  it.each([
    ["confirm the category", /Wait for them to confirm/],
    ["send items to review", /Pending Review/],
    ["ask about duplicates", /allow_duplicate: true/],
    ["set, not subtract, the balance", /it never subtracts/],
    ["not double-count bank alerts", /Never also call add_expense/],
    ["only edit or delete when asked", /explicitly asks/],
    ["never invent amounts", /Never guess or invent/],
    ["keep unpaid orders off the balance", /unpaid: true/],
    ["mark an unpaid expense paid when it's paid", /mark_expense_paid/],
    [
      "only add fixed bills for clear repeats",
      /clearly says the charge repeats/,
    ],
    [
      "not add an expense for an existing fixed bill",
      /already counted: don't add it as a separate expense/,
    ],
    ["change a bill's price from that month on", /from_month/],
    ["send an email's PDF attachment as the receipt", /send it as pdf_base64/],
    [
      "send the email itself when it has no attachment",
      /no attachment: send the email itself as email\.html/,
    ],
    [
      "know re-sending the same email is safe",
      /Sending the same email again is safe/,
    ],
    ["read email with its own tools", /Budget never reads email itself/],
    [
      "treat an e-Transfer marked rent as paying the Rent bill",
      /message "rent".*mark_bill_paid/,
    ],
    ["only count e-Transfers the user sent", /Only e-Transfers you sent count/],
    [
      "match accounts by institution plus last four",
      /institution plus last four digits/,
    ],
    [
      "send a new account to review",
      /Pending Review list like expenses do, and nothing is created until they approve it/,
    ],
    [
      "treat a statement as a snapshot",
      /snapshot as of its closing date: it never replaces a newer balance/,
    ],
    ["save the statement PDF", /pdf_base64/],
    [
      "record card payments as transfers, not expenses",
      /is a transfer, not an expense\. Call record_transfer.*never also call add_expense/,
    ],
    [
      "only count chequing toward leftover spend",
      /Only chequing counts toward leftover spend/,
    ],
    [
      "ask when unsure which account",
      /aren't sure which account.*ask the user/,
    ],
  ])("tell the AI to %s", (_rule, pattern) => {
    expect(MCP_INSTRUCTIONS).toMatch(pattern);
  });

  it("are explained to people in the AI guide, which the README links", () => {
    const root = path.resolve(__dirname, "../../..");
    const guide = readFileSync(path.join(root, "docs/mcp-ai-guide.md"), "utf8");
    for (const tool of tools.keys()) expect(guide, tool).toContain(tool);
    expect(readFileSync(path.join(root, "README.md"), "utf8")).toContain(
      "docs/mcp-ai-guide.md",
    );
  });
});

describe("callerFrom", () => {
  it("takes the user only from verified auth", () => {
    expect(
      callerFrom({
        token: "t",
        clientId: "c",
        scopes: [],
        extra: { userId: "user_a" },
      }),
    ).toEqual({ userId: "user_a", client: null });
  });

  it("names the client from the MCP handshake, else the API key", () => {
    const auth = {
      token: "t",
      clientId: "c",
      scopes: [],
      extra: { userId: "user_a", client: "Muse key" },
    };
    expect(callerFrom(auth, "Claude")?.client).toBe("Claude");
    expect(callerFrom(auth)?.client).toBe("Muse key");
  });

  it("is null without a user", () => {
    expect(callerFrom(undefined)).toBeNull();
    expect(
      callerFrom({ token: "t", clientId: "c", scopes: [], extra: {} }),
    ).toBeNull();
  });
});
