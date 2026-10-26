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
7. **Fixed bills only when it clearly repeats.** Only `add_fixed_bill` when the email says the charge repeats (a subscription, a monthly plan, an auto-renewal) or the user asks for a fixed bill, and ask first. Anything else is a one-off for `add_expense`. A charge that matches an existing fixed bill is already counted, so don't add it as a separate expense. If its payment is confirmed, `mark_bill_paid` for that month with `paid_on`, so it comes off the bank balance.
8. **Match charges to fixed bills first.** Before adding anything that might repeat, the assistant calls `find_matching_fixed_bill` (`add_expense` checks too, and answers `matches_fixed_bill` without saving). The same amount as a bill is that bill's payment: it sends it with `fixed_bill_id`, and approving it on Review marks the month paid. A different amount, or a bill entered as an estimate, gets a question first (*"Update fixed bill Claude Pro from $30.00 to $29.40 and mark this month paid?"*); on Review you can approve it as that month's payment or **Replace** the bill's amount from that month on. A new subscription goes in with `is_subscription: true`, so approving it creates the fixed bill. Usage charges, API credits and top-ups go in with `is_subscription: false` and stay normal expenses. If unsure, it asks. Either way can be flipped later with `convert_expense_to_fixed_bill` or `unlink_fixed_bill`. When `list_fixed_bills` shows `possible_unlinked_expenses`, the assistant suggests merging them into the bill (`mark_bill_paid` with `expense_id`) instead of keeping both.
9. **A payment that names its bill pays that bill.** An e-Transfer you sent with the message *"rent"* is the Rent bill being paid. The assistant finds it in `list_fixed_bills` and calls `mark_bill_paid` for that month, instead of adding an expense. If the amount differs from the bill, it tells you and offers `edit_fixed_bill`. If you have no Rent bill yet, it asks to add one (`add_fixed_bill`, Housing), then marks it paid. Money you *received* isn't a bill payment.
10. **New price? Ask, then change it from that month.** If a bill email shows a different amount (internet going from $85 to $95, say), tell the user the old and new amounts. Once they agree, call `edit_fixed_bill` with `from_month` set to that bill's month. Earlier months keep the old price.
11. **Bank balance is set, never subtracted.** When an alert states the balance of your main chequing account (the one expenses come off), the assistant calls `sync_bank_balance` with what the bank reports. When it names another account, it uses `update_account_balance`; for a statement, `record_statement` (see Accounts below). Charges dated before that day are already in the bank's number, so approving them from Review later won't take them off again. Don't also `add_expense` a charge just because a bank alert mentions it: the bill or receipt is what gets added.
12. **Edit and delete only when asked.** `edit_expense`, `delete_expense` and `edit_fixed_bill` are only for when the user explicitly asks or agrees to change a specific item. Find its id with `list_expenses` or `list_fixed_bills` and confirm which one first. They're marked destructive, so most apps ask permission before running them.
13. **Never invent anything.** Use amounts exactly as written, in dollars (`45.67`), dates as `YYYY-MM-DD` and months as `YYYY-MM`. If the email doesn't say, ask or skip it. Refunds aren't new expenses. Transfers between your own accounts and credit card or line of credit payments aren't expenses either: they're recorded with `record_transfer`.
14. **Say where it came from.** Pass a short `source` (sender and subject) with each `add_expense`, so the user can tell what it was when reviewing.

## Accounts and statements

Budget can hold several accounts: chequing accounts, credit cards and lines of credit, each with its institution, last four digits and balance. A credit card or line of credit balance is what you owe, so a higher balance means you owe more. You can add, edit, rename and delete them on the **Accounts** page; your old single bank balance became your first chequing account.

- **Leftover spend counts chequing only.** It's what your budget has left this month, held to what's in all your chequing accounts combined. Credit cards and lines of credit don't count, since you may carry a balance on purpose. If your chequing accounts are below zero overall, leftover spend and safe to spend are $0. The Overview, Report, CSV export and `list_accounts` all use the same number.
- **Statements.** For a statement email, the assistant calls `record_statement` with the institution, last four digits, closing date and closing balance (plus minimum payment, due date, credit limit and available credit when shown) and, if the email has it, the statement PDF as `pdf_base64`. The PDF is saved privately, like a receipt, so you can download it from the account on the Accounts page.
- **Matching.** The account is found by institution plus last four digits. If none matches, the assistant proposes a new one (named like *"RBC Credit card ••1234"*), which waits on the **Review** page with its statement until you approve it. Nothing is created before that. If two accounts could match, it asks you which.
- **Statements are snapshots.** A statement's balance is as of its closing date. It never replaces a newer balance (from a later low-balance alert, say), though its statement details are still saved. Recording the same statement twice changes nothing.
- **Balance alerts** that name an account go to `update_account_balance` with the balance, when it was true (`as_of`) and the `source`. An older balance never replaces a newer one.
- **Transfers aren't spending.** A credit card payment from chequing lowers your chequing balance and what you owe on the card. The assistant records it with `record_transfer`, never as an expense, so it's never counted twice. You can delete a transfer on the Accounts page.

## Receipts

`add_expense` takes an optional `receipt`, and `attach_receipt` adds one to (or replaces the one on) a saved expense or an item waiting for review. A receipt is what it says — `merchant`, `purchased_on`, `subtotal`, `tax`, `total`, `text` — plus, optionally, `image_jpeg_base64`: a JPEG of it. Only JPEGs are stored as photos. For a PDF receipt (most emailed ones), send its text and amounts instead. Expenses with a photo show 📎 that opens it. Ones with details only show the 📎 without a link.

## Tools

| Tool | What it does | Changes data? |
| --- | --- | --- |
| `list_categories` | The categories Budget uses, with examples of what goes in each | No |
| `list_expenses` | Saved expenses and items waiting for review between two dates (default: the last 31 days), with their ids and whether each is unpaid or has a receipt | No |
| `list_fixed_bills` | Fixed bills for a month (default: this month), with ids, whether each is marked paid or an estimate, its amount history, when it was last charged, and saved expenses that look like it but aren't linked | No |
| `find_matching_fixed_bill` | Which fixed bills a charge (`merchant`, `description`, `amount`, `date`) could be, with a score, the amount difference and a suggestion to show the user | No |
| `add_expense` | Sends a charge to Pending Review: `amount`, `date`, `merchant`, `category`, optional `description`, `source`, `unpaid`, `receipt`, `allow_duplicate`, `fixed_bill_id` (it's that bill's payment), `is_subscription` | Adds to review only |
| `mark_expense_paid` | Marks an unpaid expense (or pending item) paid on `paid_on`, so it comes off the balance | Yes |
| `attach_receipt` | Adds or replaces a receipt on an expense (`expense_id`) or pending item (`pending_id`) | Yes |
| `sync_bank_balance` | Sets the bank balance (your primary chequing account, the one expenses come off) to what the bank reported: `balance` (negative when overdrawn), optional `source` | Yes |
| `list_accounts` | Your accounts with ids, institutions, last four digits and balances now, accounts waiting for review, net chequing and this month's leftover spend | No |
| `propose_account` | Proposes a new account (`type`, `institution`, `last_four`, optional `name`, `balance`, `as_of`, credit details). It goes to Pending Review; nothing is created until you approve it | Adds to review only |
| `update_account_balance` | Sets one account's balance (`account_id`, or `institution` plus `last_four`) with `as_of` and `source`. Never replaces a newer balance with an older one | Yes |
| `record_statement` | Records a statement (`institution`, `last_four`, `closing_date`, `balance`, optional minimum payment, due date, limit, available credit, `pdf_base64`). Proposes a new account for review when none matches. The same statement twice changes nothing | Yes |
| `record_transfer` | Records money moved between two accounts (`from_account_id`, `to_account_id`, `amount`, `date`), like a credit card payment. Never an expense | Yes |
| `add_fixed_bill` | Adds a monthly bill: `name`, `category`, `amount`, optional `due_day`, `start_month`, `merchant`, `match_keywords`, `is_estimate` | Yes |
| `edit_fixed_bill` | Changes a bill from `from_month` on: `amount`, `name`, `category`, `due_day` | Yes (destructive) |
| `mark_bill_paid` | Marks a fixed bill paid for a `month`. With `paid_on` it comes off the balance; with `expense_id` it merges that saved expense into the bill so it counts once (`update_amount: true` also takes its amount) | Yes |
| `convert_expense_to_fixed_bill` | Makes a saved expense (`expense_id`) a fixed bill, linked as its first paid month, or marks a pending item (`pending_id`) a subscription | Yes |
| `unlink_fixed_bill` | Makes a linked or converted charge a normal expense again; the bill stays | Yes |
| `edit_expense` | Changes a saved expense: `id` plus only the fields that change (`amount`, `date`, `description`, `category`) | Yes (destructive) |
| `delete_expense` | Deletes a saved expense: `id` | Yes (destructive) |

## Examples

**A gas receipt.** The assistant finds an email from Shell for $45.67 on October 20. It checks `list_expenses` for Oct 20 (nothing matching), then asks: *"Shell, $45.67 on Oct 20 — Transportation?"* You say yes. It calls `add_expense` with `category: "Transportation"`, the receipt's total and text, and `source: "receipts@shell.ca: Your receipt"`, and tells you it's waiting for you on the Review page.

**An Amazon order and its shipping email.** The order confirmation for $62.10 on October 12 goes in as above. Later the assistant finds the "Your order has shipped" email for the same $62.10. `add_expense` answers `possible_duplicate`, matching the item already waiting for review. The assistant asks whether it's the same order; you say yes, and nothing more is added. If you'd bought the same thing twice that day, you'd say so and it would resubmit with `allow_duplicate: true`.

**An order you haven't paid yet.** An email says *"Your order has been received and will be processed once payment has been confirmed"* for $250. The assistant adds it with `unpaid: true`. You approve it, and it shows *Not paid yet* without touching your bank balance. A few days later the assistant finds your e-Transfer for it and calls `mark_expense_paid` with that day, and from then on it comes off the balance.

**A subscription and a price change.** A Google Play email says your Google AI Pro subscription *"continues and you've been charged"* $28.34. Nothing in `list_fixed_bills` matches, so the assistant asks: *"Google AI Pro looks monthly. Add it as a fixed bill for $28.34?"* Next month, your internet bill email shows $95.00 where your fixed bill says $85.00. The assistant asks *"Your internet went up from $85.00 to $95.00 — update it from November?"*. On a yes, it calls `edit_fixed_bill` with `from_month: "2026-11"` and `amount: 95`.

**Rent by e-Transfer.** You send your landlord $1,500 by e-Transfer with the message *"rent"*. The assistant finds your Rent fixed bill ($1,500, Housing) and calls `mark_bill_paid` for October, so it's ticked off on Budget's bills. Nothing is added as an expense, because rent is already counted as a fixed bill.

**A bank low-balance alert.** Your bank emails *"Your chequing balance is $412.08."* The assistant calls `sync_bank_balance` with `balance: 412.08`. Budget's bank balance becomes $412.08, and expenses dated that day or later come off it as they're added. It doesn't add the charges the alert mentions as new expenses.

**A credit card statement.** An RBC email says your Visa ending in 1234 closed October 15 with a new balance of $842.19, minimum payment $25.00 due November 8, and attaches the PDF. The assistant calls `record_statement`. You have that card, so its balance becomes $842.19 owed as of October 15, the due date and minimum payment show on the Accounts page, and the PDF is there to download. If you didn't have it yet, *"RBC Credit card ••1234"* would wait on the Review page instead. Then it finds your $842.19 payment from chequing on October 30 and calls `record_transfer`: chequing goes down, the card's balance goes down, and nothing is added as spending.

**A delete you asked for.** You say *"Delete the Shell charge from Tuesday."* The assistant calls `list_expenses` for that day, finds the Shell expense, confirms *"The $45.67 Shell expense on Oct 20?"*, and only after you say yes calls `delete_expense` with its id.
