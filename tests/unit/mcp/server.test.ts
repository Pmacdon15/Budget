import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MCP_INSTRUCTIONS } from "@/mcp/instructions";
import { callerFrom, registerBudgetTools, SERVER_OPTIONS } from "@/mcp/server";

// The tools' database work is covered by tests/integration/mcp.
vi.mock("@/mcp/tools", () => ({
  addExpense: vi.fn(),
  deleteExpense: vi.fn(),
  editExpense: vi.fn(),
  listCategories: vi.fn(),
  listExpenses: vi.fn(),
  syncBankBalance: vi.fn(),
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
      "delete_expense",
      "edit_expense",
      "list_categories",
      "list_expenses",
      "sync_bank_balance",
    ]);
  });

  it("describes every tool", () => {
    for (const [name, config] of tools) {
      expect(config.description?.length, name).toBeGreaterThan(40);
    }
  });

  it("marks the read helpers read-only", () => {
    for (const name of ["list_categories", "list_expenses"]) {
      expect(tools.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it("marks edit and delete as destructive, so clients ask first", () => {
    for (const name of ["edit_expense", "delete_expense"]) {
      expect(tools.get(name)?.annotations?.destructiveHint, name).toBe(true);
      expect(tools.get(name)?.description, name).toMatch(/explicitly asks/);
    }
  });

  it("doesn't mark adding or syncing as destructive", () => {
    for (const name of ["add_expense", "sync_bank_balance"]) {
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
