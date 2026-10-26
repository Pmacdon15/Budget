import "server-only";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  addExpenseInputSchema,
  addFixedBillInputSchema,
  attachReceiptInputSchema,
  convertExpenseToFixedBillInputSchema,
  deleteExpenseInputSchema,
  editExpenseInputSchema,
  editFixedBillInputSchema,
  findMatchingFixedBillInputSchema,
  listExpensesInputSchema,
  listFixedBillsInputSchema,
  markBillPaidInputSchema,
  markExpensePaidInputSchema,
  syncBankBalanceInputSchema,
  unlinkFixedBillInputSchema,
} from "@/lib/pending-expenses";
import { MCP_INSTRUCTIONS } from "@/mcp/instructions";
import {
  addExpense,
  addFixedBill,
  attachReceipt,
  convertExpenseToFixedBill,
  deleteExpense,
  editExpense,
  editFixedBill,
  findMatchingFixedBill,
  listCategories,
  listExpenses,
  listFixedBills,
  type McpCaller,
  markBillPaid,
  markExpensePaid,
  syncBankBalance,
  type ToolResult,
  unlinkFixedBill,
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
        "Submits a charge you found (e.g. in an email) to the user's Pending Review list. It does not become an expense until the user approves it in Budget. Before calling, tell the user the merchant, amount and date and the category you suggest, and wait for them to confirm the category. If the answer is status 'possible_duplicate', nothing was saved: ask the user, and only resubmit with allow_duplicate: true if they say it's a separate charge. It also checks the user's fixed bills: status 'matches_fixed_bill' means nothing was saved and the charge looks like one of them; show the user the suggestion, then resubmit with fixed_bill_id (it's that bill) or is_subscription: false (a separate charge). Set is_subscription: true for a subscription with no fixed bill yet, so approving it creates one. When the email is the bill or receipt, include it as receipt: its amounts and text, plus its PDF attachment (or a JPEG), or the email itself (receipt.email.html or text) when it has no attachment. An email already saved as a receipt (same message_id or file) answers 'possible_duplicate'.",
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

  server.registerTool(
    "mark_expense_paid",
    {
      title: "Mark an expense paid",
      description:
        "Marks an expense that was added as not paid yet (unpaid: true) as paid, when you find its payment (a bank transfer sent, a payment confirmation). From then on it comes off the bank balance. Works on saved expenses and items still waiting for review. Use the date the payment went out.",
      inputSchema: markExpensePaidInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        markExpensePaid(caller, args),
      ),
  );

  server.registerTool(
    "attach_receipt",
    {
      title: "Attach a receipt",
      description:
        "Saves a bill or receipt email as the receipt of a saved expense (expense_id), an item waiting for review (pending_id), or a fixed bill's payment for a month (fixed_bill_id + month, once it's marked paid), replacing the one it has. The user can then open and download it in Budget. Send what the receipt says (merchant, date, subtotal, tax, total, text) plus one copy to keep: the email's PDF attachment (pdf_base64), or a JPEG of it (image_jpeg_base64), or, when the email has no attachment, the email itself (email.html or email.text). Always send email.message_id, subject, from and date. Sending the same email again changes nothing, so it's safe to retry. Replacing a receipt on a split expense changes it for every part.",
      inputSchema: attachReceiptInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => attachReceipt(caller, args)),
  );

  server.registerTool(
    "list_fixed_bills",
    {
      title: "List fixed bills",
      description:
        "The user's fixed bills (rent, phone, internet, subscriptions) for a month (default: this month), with their ids and whether each is marked paid. Check this before adding a fixed bill or a one-off expense for something that may already be a fixed bill.",
      inputSchema: listFixedBillsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => listFixedBills(caller, args)),
  );

  server.registerTool(
    "add_fixed_bill",
    {
      title: "Add a fixed bill",
      description:
        "Adds a bill that repeats every month. Only use it when the email clearly says the charge repeats (a subscription, a monthly plan, an auto-renewal) or the user asks for a fixed bill; otherwise use add_expense. Ask the user before adding, e.g. 'Google AI Pro looks monthly. Add it as a fixed bill for $28.34?'.",
      inputSchema: addFixedBillInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => addFixedBill(caller, args)),
  );

  server.registerTool(
    "edit_fixed_bill",
    {
      title: "Edit a fixed bill",
      description:
        "Changes a fixed bill from a month onward, e.g. when a bill email shows a new price. Earlier months keep the old values. Tell the user the old and new amounts and get their OK before calling. Pass only the fields that change.",
      inputSchema: editFixedBillInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => editFixedBill(caller, args)),
  );

  server.registerTool(
    "mark_bill_paid",
    {
      title: "Mark a fixed bill paid",
      description:
        "Marks a fixed bill paid for a month, when you find its payment. Pass paid_on (the day the money left) so it comes off the bank balance like an expense. To merge a saved expense that is this bill's payment, pass expense_id: the expense is linked to the bill and counts once (with update_amount: true the bill also takes that expense's amount, once the user agreed). The bill counts toward the month either way.",
      inputSchema: markBillPaidInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => markBillPaid(caller, args)),
  );

  server.registerTool(
    "find_matching_fixed_bill",
    {
      title: "Find the fixed bill a charge matches",
      description:
        "Given a charge (merchant, description, amount, date), returns the user's fixed bills it could be, with a score, the amount difference and a suggestion to show the user (e.g. 'Update fixed bill Internet from $80.00 to $85.00 and mark 2026-10 paid?'). Matches on merchant name, then amount (within 15% by default) and billing day. Call it before add_expense or add_fixed_bill for anything that might repeat. Changes nothing.",
      inputSchema: findMatchingFixedBillInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        findMatchingFixedBill(caller, args),
      ),
  );

  server.registerTool(
    "convert_expense_to_fixed_bill",
    {
      title: "Turn an expense into a fixed bill",
      description:
        "Makes a saved expense (expense_id) a fixed bill from its month, with that expense linked as the first paid month, so it counts once. For an item waiting for review (pending_id), marks it a subscription: approving it creates the bill. Only after the user said it's a subscription.",
      inputSchema: convertExpenseToFixedBillInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        convertExpenseToFixedBill(caller, args),
      ),
  );

  server.registerTool(
    "unlink_fixed_bill",
    {
      title: "Make a charge a normal expense again",
      description:
        "The reverse of linking or converting: a saved expense (expense_id) stops being a fixed bill's payment and counts as normal spending, or an item waiting for review (pending_id) is no longer linked to a bill or marked a subscription. Use it when the user says a charge isn't the subscription (e.g. usage credits). It doesn't delete the bill.",
      inputSchema: unlinkFixedBillInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        unlinkFixedBill(caller, args),
      ),
  );
}
