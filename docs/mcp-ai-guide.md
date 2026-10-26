# Using Budget from an AI assistant

Budget has an MCP server at **`https://budget.patmac.ca/api/mcp`**. Connect it to Claude, Muse, Gemini or any other app that supports MCP connectors, and your assistant can go through your email for bills, receipts, orders, payment confirmations and bank alerts and record them in Budget for you.

This guide explains how the assistant is meant to use it. The same rules are sent to every assistant automatically when it connects (the server's MCP `instructions`, in `src/mcp/instructions.ts`), so you don't need to paste anything. It's here so you know what to expect, and so you can paste it into an assistant that doesn't pick up server instructions.

## Connecting

1. In your AI app, add a custom connector with the URL `https://budget.patmac.ca/api/mcp`.
2. When it asks, sign in with your Budget account. The assistant only ever sees your own data.
3. Make sure the assistant can read your email too (for Claude, connect Gmail). Budget never reads your email itself; the assistant reads it with its own email tools and tells Budget what it found. Then ask something like *"Go through my email from this month for bills and receipts and add them to Budget."*

If your app can't sign in with OAuth, open **Review** in Budget, choose **Create API key**, and give the app the URL plus the key. You can revoke a key there at any time.

## The rules

1. **Look first.** Call `list_categories` once, plus `list_fixed_bills` and `list_expenses` for the dates involved, to suggest a category and spot anything already recorded: an expense, an item waiting for review, or a fixed bill.
2. **Confirm the category with the user.** Say what you found and suggest a category, e.g. *"Shell, $45.67 on Oct 20 — Transportation?"*, and wait for a yes or a different category.
3. **`add_expense` goes to review.** It doesn't create an expense. The item lands on the user's **Pending Review** list in Budget, and they approve, edit or reject it there. When the email is the receipt, include it as `receipt`.
4. **Ask about duplicates.** If `add_expense` answers `possible_duplicate`, nothing was saved. Show the user the match and ask whether it's the same purchase. Only resubmit with `allow_duplicate: true` if they say it's a separate charge.
5. **One purchase, one expense.** An order confirmation, a shipping notice, a receipt and a card alert are often all the same purchase. Two charges with the same amount on the same day count as one unless the user says otherwise.
6. **Not paid yet stays off the balance.** An order or invoice that hasn't been paid (*"will be processed once payment is confirmed"*) goes in with `unpaid: true`. It counts as spending, but doesn't come off the bank balance. When the payment shows up (a transfer sent, a payment confirmation), call `mark_expense_paid` with the day it was paid.
7. **Fixed bills only when it clearly repeats.** Only `add_fixed_bill` when the email says the charge repeats (a subscription, a monthly plan, an auto-renewal) or the user asks for a fixed bill, and ask first. Anything else is a one-off for `add_expense`. A charge that matches an existing fixed bill is already counted, so don't add it as an expense. If its payment is confirmed, `mark_bill_paid` for that month.
8. **A payment that names its bill pays that bill.** An e-Transfer you sent with the message *"rent"* is the Rent bill being paid. The assistant finds it in `list_fixed_bills` and calls `mark_bill_paid` for that month, instead of adding an expense. If the amount differs from the bill, it tells you and offers `edit_fixed_bill`. If you have no Rent bill yet, it asks to add one (`add_fixed_bill`, Housing), then marks it paid. Money you *received* isn't a bill payment.
9. **New price? Ask, then change it from that month.** If a bill email shows a different amount (internet going from $85 to $95, say), tell the user the old and new amounts. Once they agree, call `edit_fixed_bill` with `from_month` set to that bill's month. Earlier months keep the old price.
10. **Bank balance is set, never subtracted.** When an email states the account balance (a low-balance or debit alert, a statement), call `sync_bank_balance` with what the bank reports. Charges dated before that day are already in the bank's number, so approving them from Review later won't take them off again. Don't also `add_expense` a charge just because a bank alert mentions it: the bill or receipt is what gets added.
11. **Edit and delete only when asked.** `edit_expense`, `delete_expense` and `edit_fixed_bill` are only for when the user explicitly asks or agrees to change a specific item. Find its id with `list_expenses` or `list_fixed_bills` and confirm which one first. They're marked destructive, so most apps ask permission before running them.
12. **Never invent anything.** Use amounts exactly as written, in dollars (`45.67`), dates as `YYYY-MM-DD` and months as `YYYY-MM`. If the email doesn't say, ask or skip it. Refunds, transfers between your own accounts and credit-card payments aren't new expenses.
13. **Say where it came from.** Pass a short `source` (sender and subject) with each `add_expense`, so the user can tell what it was when reviewing.

## Receipts

`add_expense` takes an optional `receipt`, and `attach_receipt` adds one to (or replaces the one on) a saved expense or an item waiting for review. A receipt is what it says — `merchant`, `purchased_on`, `subtotal`, `tax`, `total`, `text` — plus, optionally, `image_jpeg_base64`: a JPEG of it. Only JPEGs are stored as photos. For a PDF receipt (most emailed ones), send its text and amounts instead. Expenses with a photo show 📎 that opens it. Ones with details only show the 📎 without a link.

## Tools

| Tool | What it does | Changes data? |
| --- | --- | --- |
| `list_categories` | The categories Budget uses, with examples of what goes in each | No |
| `list_expenses` | Saved expenses and items waiting for review between two dates (default: the last 31 days), with their ids and whether each is unpaid or has a receipt | No |
| `list_fixed_bills` | Fixed bills for a month (default: this month), with ids and whether each is marked paid | No |
| `add_expense` | Sends a charge to Pending Review: `amount`, `date`, `merchant`, `category`, optional `description`, `source`, `unpaid`, `receipt`, `allow_duplicate` | Adds to review only |
| `mark_expense_paid` | Marks an unpaid expense (or pending item) paid on `paid_on`, so it comes off the balance | Yes |
| `attach_receipt` | Adds or replaces a receipt on an expense (`expense_id`) or pending item (`pending_id`) | Yes |
| `sync_bank_balance` | Sets the bank balance to what the bank reported: `balance` (negative when overdrawn), optional `source` | Yes |
| `add_fixed_bill` | Adds a monthly bill: `name`, `category`, `amount`, optional `due_day`, `start_month` | Yes |
| `edit_fixed_bill` | Changes a bill from `from_month` on: `amount`, `name`, `category`, `due_day` | Yes (destructive) |
| `mark_bill_paid` | Ticks a fixed bill paid for a `month`. Bookkeeping only; it doesn't change the balance | Yes |
| `edit_expense` | Changes a saved expense: `id` plus only the fields that change (`amount`, `date`, `description`, `category`) | Yes (destructive) |
| `delete_expense` | Deletes a saved expense: `id` | Yes (destructive) |

## Examples

**A gas receipt.** The assistant finds an email from Shell for $45.67 on October 20. It checks `list_expenses` for Oct 20 (nothing matching), then asks: *"Shell, $45.67 on Oct 20 — Transportation?"* You say yes. It calls `add_expense` with `category: "Transportation"`, the receipt's total and text, and `source: "receipts@shell.ca: Your receipt"`, and tells you it's waiting for you on the Review page.

**An Amazon order and its shipping email.** The order confirmation for $62.10 on October 12 goes in as above. Later the assistant finds the "Your order has shipped" email for the same $62.10. `add_expense` answers `possible_duplicate`, matching the item already waiting for review. The assistant asks whether it's the same order; you say yes, and nothing more is added. If you'd bought the same thing twice that day, you'd say so and it would resubmit with `allow_duplicate: true`.

**An order you haven't paid yet.** An email says *"Your order has been received and will be processed once payment has been confirmed"* for $250. The assistant adds it with `unpaid: true`. You approve it, and it shows *Not paid yet* without touching your bank balance. A few days later the assistant finds your e-Transfer for it and calls `mark_expense_paid` with that day, and from then on it comes off the balance.

**A subscription and a price change.** A Google Play email says your Google AI Pro subscription *"continues and you've been charged"* $28.34. Nothing in `list_fixed_bills` matches, so the assistant asks: *"Google AI Pro looks monthly. Add it as a fixed bill for $28.34?"* Next month, your internet bill email shows $95.00 where your fixed bill says $85.00. The assistant asks *"Your internet went up from $85.00 to $95.00 — update it from November?"*. On a yes, it calls `edit_fixed_bill` with `from_month: "2026-11"` and `amount: 95`.

**Rent by e-Transfer.** You send your landlord $1,500 by e-Transfer with the message *"rent"*. The assistant finds your Rent fixed bill ($1,500, Housing) and calls `mark_bill_paid` for October, so it's ticked off on Budget's bills. Nothing is added as an expense, because rent is already counted as a fixed bill.

**A bank low-balance alert.** Your bank emails *"Your chequing balance is $412.08."* The assistant calls `sync_bank_balance` with `balance: 412.08`. Budget's bank balance becomes $412.08, and expenses dated that day or later come off it as they're added. It doesn't add the charges the alert mentions as new expenses.

**A delete you asked for.** You say *"Delete the Shell charge from Tuesday."* The assistant calls `list_expenses` for that day, finds the Shell expense, confirms *"The $45.67 Shell expense on Oct 20?"*, and only after you say yes calls `delete_expense` with its id.
