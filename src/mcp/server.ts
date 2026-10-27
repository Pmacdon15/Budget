import "server-only";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  listAccountsInputSchema,
  proposeAccountInputSchema,
  recordStatementInputSchema,
  recordTransferInputSchema,
  updateAccountBalanceInputSchema,
} from "@/lib/account-tools";
import {
  addExpenseInputSchema,
  addFixedBillInputSchema,
  attachReceiptInputSchema,
  convertExpenseToFixedBillInputSchema,
  deleteExpenseInputSchema,
  editExpenseInputSchema,
  editFixedBillInputSchema,
  findMatchingFixedBillInputSchema,
  listCategoriesInputSchema,
  listExpensesInputSchema,
  listFixedBillsInputSchema,
  markBillPaidInputSchema,
  markExpensePaidInputSchema,
  readReceiptInputSchema,
  syncBankBalanceInputSchema,
  unlinkFixedBillInputSchema,
} from "@/lib/pending-expenses";
import {
  addIncomeInputSchema,
  listIncomeInputSchema,
} from "@/lib/pending-income";
import {
  listAccounts,
  proposeAccount,
  recordStatement,
  recordTransfer,
  updateAccountBalance,
} from "@/mcp/account-tools";
import { addIncome, listIncome } from "@/mcp/income-tools";
import { MCP_INSTRUCTIONS } from "@/mcp/instructions";
import { portable } from "@/mcp/portable-schema";
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
  readReceipt,
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
  // The tool list never changes while a client is connected. Saying so keeps
  // clients from holding a `subscriptions/listen` stream open for change
  // notifications: on a serverless function that stream can only end in a
  // timeout, which some clients then report as the connector failing.
  capabilities: { tools: { listChanged: false } },
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
      inputSchema: portable(listCategoriesInputSchema),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) => run(server, ctx.http?.authInfo, () => listCategories(args)),
  );

  server.registerTool(
    "list_expenses",
    {
      title: "List expenses",
      description:
        "The user's saved expenses and items waiting for review between two dates (default: the last 31 days). Use it to check whether a charge is already recorded and to find an expense's id before editing or deleting it.",
      inputSchema: portable(listExpensesInputSchema),
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
      inputSchema: portable(addExpenseInputSchema),
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
        "Sets the user's bank balance (their primary chequing account, the one expenses come off) to what their bank reported in a low-balance or debit alert. It replaces the balance; it never subtracts. Expenses added after this come off it. Don't also add_expense a charge only because a bank alert mentions it. When the email names the account (institution and last four digits), use update_account_balance; for a statement, record_statement.",
      inputSchema: portable(syncBankBalanceInputSchema),
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
      inputSchema: portable(editExpenseInputSchema),
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
      inputSchema: portable(deleteExpenseInputSchema),
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
      inputSchema: portable(markExpensePaidInputSchema),
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
      inputSchema: portable(attachReceiptInputSchema),
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
    "read_receipt",
    {
      title: "Read a saved receipt",
      description:
        "What a saved expense's (expense_id) or pending item's (pending_id) receipt says: merchant, date, amounts, currency and text, as read when it was saved, including files the user uploaded in Budget. With read_file: true, reads its PDF, photo or email with AI now (uses one receipt scan). Changes nothing: to fix an amount from it, ask the user (for another currency, what their card was charged in CAD), then call edit_expense.",
      inputSchema: portable(readReceiptInputSchema),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => readReceipt(caller, args)),
  );

  server.registerTool(
    "list_fixed_bills",
    {
      title: "List fixed bills",
      description:
        "The user's fixed bills (rent, phone, internet, subscriptions) for a month (default: this month), with their ids and whether each is marked paid. Check this before adding a fixed bill or a one-off expense for something that may already be a fixed bill.",
      inputSchema: portable(listFixedBillsInputSchema),
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
      inputSchema: portable(addFixedBillInputSchema),
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
      inputSchema: portable(editFixedBillInputSchema),
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
      inputSchema: portable(markBillPaidInputSchema),
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
      inputSchema: portable(findMatchingFixedBillInputSchema),
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
      inputSchema: portable(convertExpenseToFixedBillInputSchema),
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
      inputSchema: portable(unlinkFixedBillInputSchema),
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
  server.registerTool(
    "add_income",
    {
      title: "Add income for review",
      description:
        "Submits money the user received that you found (e.g. in an email): an Interac e-Transfer someone sent them, a direct deposit, a client's payment. It goes to the user's Pending Review list; approving it in Budget makes it take-home for that month and adds it to the account it went into (primary chequing unless you pass account_id). Before calling, tell the user who paid, the amount and date, and wait for them to confirm it's income. Only money that came in: an e-Transfer the user sent is spending (add_expense, or mark_bill_paid when it pays a bill), and money moved between their own accounts is record_transfer. Include the email as receipt (an e-Transfer notice has no attachment, so send the email itself as receipt.email.html or text). If the answer is status 'possible_duplicate', nothing was saved: ask the user, and only resubmit with allow_duplicate: true if they say it's a separate payment.",
      inputSchema: portable(addIncomeInputSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => addIncome(caller, args)),
  );

  server.registerTool(
    "list_income",
    {
      title: "List income",
      description:
        "The user's take-home entries and income waiting for review between two dates (default: the last 31 days), with who paid, the amount, the account and whether each has a receipt. Use it to check whether a payment is already recorded before add_income.",
      inputSchema: portable(listIncomeInputSchema),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => listIncome(caller, args)),
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List accounts",
      description:
        "The user's accounts (chequing, credit cards, lines of credit) with their ids, institutions, last four digits and balances now, plus accounts waiting for review, net chequing and this month's leftover spend. Credit card and line of credit balances are what's owed. Call it before updating a balance, recording a statement or a transfer.",
      inputSchema: portable(listAccountsInputSchema),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => listAccounts(caller, args)),
  );

  server.registerTool(
    "propose_account",
    {
      title: "Propose a new account for review",
      description:
        "Proposes an account Budget doesn't have yet (named by institution, type and last four unless you give a name). It goes to the user's Pending Review list; nothing is created until they approve it. Answers 'already_exists' or 'already_pending' without saving when the institution and last four already match. Ask the user before proposing if you aren't sure it's a new account.",
      inputSchema: portable(proposeAccountInputSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => proposeAccount(caller, args)),
  );

  server.registerTool(
    "update_account_balance",
    {
      title: "Update an account's balance",
      description:
        "Sets one account's balance to what the bank reported (an alert or balance email), found by account_id or by institution plus last four digits, with when it was true (as_of) and where it came from (source). An older balance never replaces a newer one: the answer is 'kept_newer' and nothing changes. For a credit card or line of credit, the balance is what's owed. For a statement, use record_statement instead.",
      inputSchema: portable(updateAccountBalanceInputSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        updateAccountBalance(caller, args),
      ),
  );

  server.registerTool(
    "record_statement",
    {
      title: "Record a statement",
      description:
        "Records a statement email for the account it names (institution plus last four digits): the closing balance as of the closing date, minimum payment, due date and, with pdf_base64, the statement PDF, saved so the user can download it. A statement is a snapshot: it updates the balance only when nothing newer is known. With no matching account, it proposes a new one (with account_type) for the user to approve on the Review page. Recording the same statement again changes nothing.",
      inputSchema: portable(recordStatementInputSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) =>
        recordStatement(caller, args),
      ),
  );

  server.registerTool(
    "record_transfer",
    {
      title: "Record a transfer between accounts",
      description:
        "Records money moved between two of the user's accounts, such as a credit card or line of credit payment from chequing. It lowers one balance and changes the other; it is never an expense, so don't also add_expense it. Answers 'possible_duplicate' without saving when the same accounts, amount and day are already recorded; only resubmit with allow_duplicate: true if the user says it's separate.",
      inputSchema: portable(recordTransferInputSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      run(server, ctx.http?.authInfo, (caller) => recordTransfer(caller, args)),
  );
}
