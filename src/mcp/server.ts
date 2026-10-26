import "server-only";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  addExpenseInputSchema,
  deleteExpenseInputSchema,
  editExpenseInputSchema,
  listExpensesInputSchema,
  syncBankBalanceInputSchema,
} from "@/lib/pending-expenses";
import { MCP_INSTRUCTIONS } from "@/mcp/instructions";
import {
  addExpense,
  deleteExpense,
  editExpense,
  listCategories,
  listExpenses,
  type McpCaller,
  syncBankBalance,
  type ToolResult,
} from "@/mcp/tools";

/*
 * The Budget MCP server: its name, instructions and tools. Standard MCP only,
 * with nothing specific to one AI app, so any MCP client (Claude, Muse,
 * Gemini, ...) can use it. Tool names and annotations are checked by
 * tests/unit/mcp/server.test.ts.
 */

export const SERVER_INFO = { name: "budget", version: "1.0.0" };

export const SERVER_OPTIONS = {
  serverInfo: SERVER_INFO,
  instructions: MCP_INSTRUCTIONS,
};

/** The verified caller from the request's auth, or null when there isn't one. */
export function callerFrom(
  authInfo: AuthInfo | undefined,
  clientName?: string | null,
): McpCaller | null {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) return null;
  const fromAuth = authInfo?.extra?.client;
  return {
    userId,
    client:
      clientName || (typeof fromAuth === "string" ? fromAuth : null) || null,
  };
}

const text = (value: string) => ({ type: "text" as const, text: value });

/** A tool's result as MCP content: the sentence first, then the data as JSON. */
function respond(result: ToolResult) {
  return {
    content: [text(result.summary), text(JSON.stringify(result.data, null, 2))],
    structuredContent: result.data,
    ...(result.isError ? { isError: true } : {}),
  };
}

/** Runs a tool for the verified caller; bad input becomes a readable tool error. */
async function run(
  server: McpServer,
  authInfo: AuthInfo | undefined,
  tool: (caller: McpCaller) => ToolResult | Promise<ToolResult>,
) {
  const caller = callerFrom(
    authInfo,
    server.server.getClientVersion()?.name ?? null,
  );
  if (!caller) {
    return respond({
      summary: "Not signed in to Budget. Reconnect the connector and sign in.",
      data: {},
      isError: true,
    });
  }
  try {
    return respond(await tool(caller));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respond({
        summary: `Invalid input: ${error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`,
        data: {},
        isError: true,
      });
    }
    console.error(error);
    return respond({
      summary: "Something went wrong in Budget. Try again shortly.",
      data: {},
      isError: true,
    });
  }
}

export function registerBudgetTools(server: McpServer) {
  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description:
        "The expense categories Budget uses, with examples of what goes in each. Call this before suggesting a category.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (ctx) => run(server, ctx.http?.authInfo, () => listCategories()),
  );

  server.registerTool(
    "list_expenses",
    {
      title: "List expenses",
      description:
        "The user's saved expenses and items waiting for review between two dates (default: the last 31 days). Use it to check whether a charge is already recorded and to find an expense's id before editing or deleting it.",
      inputSchema: listExpensesInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => listExpenses(caller, args)),
  );

  server.registerTool(
    "add_expense",
    {
      title: "Add expense for review",
      description:
        "Submits a charge you found (e.g. in an email) to the user's Pending Review list. It does not become an expense until the user approves it in Budget. Before calling, tell the user the merchant, amount and date and the category you suggest, and wait for them to confirm the category. If the answer is status 'possible_duplicate', nothing was saved: ask the user, and only resubmit with allow_duplicate: true if they say it's a separate charge.",
      inputSchema: addExpenseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => addExpense(caller, args)),
  );

  server.registerTool(
    "sync_bank_balance",
    {
      title: "Set bank balance",
      description:
        "Sets the user's bank balance to what their bank reported (from a low-balance or debit alert, or a statement). It replaces the balance; it never subtracts. Expenses added after this come off it. Don't also add_expense a charge only because a bank alert mentions it.",
      inputSchema: syncBankBalanceInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        syncBankBalance(caller, args),
      ),
  );

  server.registerTool(
    "edit_expense",
    {
      title: "Edit a saved expense",
      description:
        "Changes a saved expense. Only use this when the user explicitly asks to change a specific expense; confirm which one first (find its id with list_expenses). Pass only the fields that change.",
      inputSchema: editExpenseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => editExpense(caller, args)),
  );

  server.registerTool(
    "delete_expense",
    {
      title: "Delete a saved expense",
      description:
        "Permanently deletes a saved expense. Only use this when the user explicitly asks to delete a specific expense; confirm which one first (find its id with list_expenses). Never use it on your own initiative or to clean up duplicates without asking.",
      inputSchema: deleteExpenseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => deleteExpense(caller, args)),
  );
}
