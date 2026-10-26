# Using Budget from an AI assistant

Budget has an MCP server at **`https://budget.patmac.ca/api/mcp`**. Connect it to Claude, Muse, Gemini or any other app that supports MCP connectors, and your assistant can go through your email for bills, receipts, orders and bank alerts and record them in Budget for you.

This guide explains how the assistant is meant to use it. The same rules are sent to every assistant automatically when it connects (the server's MCP `instructions`, in `src/mcp/instructions.ts`), so you don't need to paste anything. It's here so you know what to expect, and so you can paste it into an assistant that doesn't pick up server instructions.

## Connecting

1. In your AI app, add a custom connector with the URL `https://budget.patmac.ca/api/mcp`.
2. When it asks, sign in with your Budget account. The assistant only ever sees your own data.
3. Make sure the assistant can read your email too (for Claude, connect Gmail), then ask something like *"Go through my email from this month for bills and receipts and add them to Budget."*

If your app can't sign in with OAuth, open **Review** in Budget, choose **Create API key**, and give the app the URL plus the key. You can revoke a key there at any time.

## The rules

1. **Look first.** Call `list_categories` once, and `list_expenses` for the dates involved, to suggest a category and spot anything already recorded.
2. **Confirm the category with the user.** Say what you found and suggest a category, e.g. *"Shell, $45.67 on Oct 20 — Transportation?"*, and wait for a yes or a different category.
3. **`add_expense` goes to review.** It doesn't create an expense. The item lands on the user's **Pending Review** list in Budget, and they approve, edit or reject it there. Approved items become normal expenses and come off the bank balance.
4. **Ask about duplicates.** If `add_expense` answers `possible_duplicate`, nothing was saved. Show the user the match and ask whether it's the same purchase. Only resubmit with `allow_duplicate: true` if they say it's a separate charge.
5. **One purchase, one expense.** An order confirmation, a shipping notice, a receipt and a card alert are often all the same purchase. Two charges with the same amount on the same day count as one unless the user says otherwise.
6. **Bank balance is set, never subtracted.** When an email states the account balance (a low-balance or debit alert, a statement), call `sync_bank_balance` with what the bank reports. Don't also `add_expense` a charge just because a bank alert mentions it: the bill or receipt is what gets added.
7. **Edit and delete only when asked.** `edit_expense` and `delete_expense` are only for when the user explicitly asks to change or remove a specific expense. Find its id with `list_expenses` and confirm which one first. They're marked destructive, so most apps ask permission before running them.
8. **Never invent anything.** Use amounts exactly as written, in dollars (`45.67`), and dates as `YYYY-MM-DD`. If the email doesn't say, ask or skip it. Refunds, transfers between your own accounts and credit-card payments aren't new expenses.
9. **Say where it came from.** Pass a short `source` (sender and subject) with each `add_expense`, so the user can tell what it was when reviewing.

## Tools

| Tool | What it does | Changes data? |
| --- | --- | --- |
| `list_categories` | The categories Budget uses, with examples of what goes in each | No |
| `list_expenses` | Saved expenses and items waiting for review between two dates (default: the last 31 days), with their ids | No |
| `add_expense` | Sends a charge to Pending Review: `amount`, `date`, `merchant`, `category`, optional `description`, `source`, `allow_duplicate` | Adds to review only |
| `sync_bank_balance` | Sets the bank balance to what the bank reported: `balance` (negative when overdrawn), optional `source` | Yes |
| `edit_expense` | Changes a saved expense: `id` plus only the fields that change (`amount`, `date`, `description`, `category`) | Yes (destructive) |
| `delete_expense` | Deletes a saved expense: `id` | Yes (destructive) |

## Examples

**A gas receipt.** The assistant finds an email from Shell for $45.67 on October 20. It checks `list_expenses` for Oct 20 (nothing matching), then asks: *"Shell, $45.67 on Oct 20 — Transportation?"* You say yes. It calls `add_expense` with `category: "Transportation"` and `source: "receipts@shell.ca: Your receipt"`, and tells you it's waiting for you on the Review page.

**An Amazon order and its shipping email.** The order confirmation for $62.10 on October 12 goes in as above. Later the assistant finds the "Your order has shipped" email for the same $62.10. `add_expense` answers `possible_duplicate`, matching the item already waiting for review. The assistant asks whether it's the same order; you say yes, and nothing more is added. If you'd bought the same thing twice that day, you'd say so and it would resubmit with `allow_duplicate: true`.

**A bank low-balance alert.** Your bank emails *"Your chequing balance is $412.08."* The assistant calls `sync_bank_balance` with `balance: 412.08`. Budget's bank balance becomes $412.08, and expenses you add after that come off it. It doesn't add the charges the alert mentions as new expenses.

**A delete you asked for.** You say *"Delete the Shell charge from Tuesday."* The assistant calls `list_expenses` for that day, finds the Shell expense, confirms *"The $45.67 Shell expense on Oct 20?"*, and only after you say yes calls `delete_expense` with its id.
