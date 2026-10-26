# Budget

A personal monthly budgeting app — live at **[budget.patmac.ca](https://budget.patmac.ca)**.

- **Fixed bills** — rent, phone, insurance, subscriptions. Enter once, they repeat every month. Changing an amount applies from the month you're viewing onward, so past months and reports stay accurate.
- **Take-home** — record what actually landed each month (one entry per paycheque). Shows a rolling 3-month average and a 12-month trend.
- **Spending** — one-off expenses by category (including Auto, Food and Alcohol).
  - **Scan receipt** — take a photo with the camera or pick one, from the Spending page or inside any Add expense form; AI reads the store, date, total, tax and category and pre-fills the expense for you to confirm. A receipt with things from several categories (groceries and beer, say) is split into one expense per category; the AI suggests the split and you can adjust it. Any new expense can be split by hand too. The photo and everything read off it are saved with the expense (📎 opens it).
  - **Download** — expenses as **CSV**, **Excel** or **PDF** for any month range, with checkboxes to choose the categories. PDFs can include the receipt photos.
- **Overview** — this month at a glance: take-home, bills, spending, what's left, a 12-month history chart and a category breakdown.
- **Accounts** — chequing accounts, credit cards and lines of credit, each with its institution, last four digits, balance and as-of date (and, for credit, limit, available credit, statement balance, due date and minimum payment). A credit card or line of credit balance is what's owed. Add, edit, rename and delete them on the **Accounts** page; your old single bank balance became your first chequing account. Transfers between accounts (a card payment from chequing) change both balances and are never spending. Your AI can update balances from alerts, record statement emails (saving the PDF to download) and propose new accounts for you to approve on **Review**.
- **Leftover spend** — "Left over" and "Safe to spend" for this month are the budget's leftover held to what's in all your chequing accounts combined, and $0 whenever chequing is below zero overall. Credit cards and lines of credit don't count. It's worked out in one place (`src/lib/leftover.ts`, applied in the month overview), so the Overview, Report, CSV export and the AI's `list_accounts` agree.
- **Bank balance** — your primary chequing account's balance: enter what your account shows (negative is fine when overdrawn), or let your AI set it from a bank alert. Expenses dated on or after that day, added after the balance, come off it, so the card shows what's left in the bank, with a line like "Entered $1,000.00, less $40.00 spent since". Anything dated earlier is already in your bank's number, so it never comes off, even if you add it or approve it from Review afterwards. Editing, deleting or undoing an expense keeps it right, because the debit is worked out from the expenses that exist now, and entering a new balance starts fresh.
- **Monthly report** — summary vs. last month and your 12-month average, category breakdown, every line item, plus **Print / PDF** and **CSV** export.
- **AI connector** — an [MCP](https://modelcontextprotocol.io) server at `https://budget.patmac.ca/api/mcp` that Claude, Muse, Gemini or any MCP-capable assistant can connect to. Ask it to go through your email, and it suggests a category for each bill, receipt or order and checks with you, then sends it to **Review**. Nothing counts until you approve it there, where you can also edit or reject it. It can attach the receipt from the email, keep an unpaid order off your bank balance until it sees the payment, add fixed bills for clear subscriptions, update a bill's price from the month it changed, tick bills paid (an e-Transfer you sent with the message "rent" ticks off your Rent bill), set your bank balance from a bank alert, and edit or delete an expense when you explicitly ask. See [docs/mcp-ai-guide.md](docs/mcp-ai-guide.md) for how to connect and the rules the assistant follows.

## Stack

Next.js 16 (App Router, `src/`, React Compiler, Cache Components) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) + Recharts · Biome · Bun · Clerk (auth) · Neon Postgres · Vercel Blob · Vercel AI Gateway (Claude) · pdf-lib.

## Architecture

Reads and writes each go through one path, and Zod validates on both sides of the network:

```
Reads:   page (server component) → DAL → DB functions → Neon
Writes:  form (Zod) → TanStack Query mutation → server action (Zod) → DAL → DB functions → Neon
```

| Layer | Folder | Job |
| --- | --- | --- |
| Schemas | `src/lib/schemas.ts` | Zod schemas shared by forms and server actions |
| Mutations | `src/mutations/` | `useMutation` hooks that call server actions |
| Server actions | `src/actions/` | Re-validate input with Zod, call the DAL, revalidate the app |
| DAL | `src/dal/` | Auth (Clerk user), ownership checks and business rules |
| DB functions | `src/db/` | Raw SQL only, no auth or rules |
| MCP server | `src/mcp/` | The AI connector's tools and instructions; the user comes only from the verified token, never from tool arguments |

Pure budget math lives in `src/lib/budget.ts` and shared types in `src/lib/types.ts`, so client components never import server code.

## Setup

Required environment variables (Vercel sets these when the Clerk and Neon integrations are connected to the project):

| Variable | Source |
| --- | --- |
| `DATABASE_URL` | Neon |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk |
| `CLERK_SECRET_KEY` | Clerk |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (private store `budget-receipts`, holds receipt photos) |
| `CRON_SECRET` | Any random string of 16+ characters. Vercel Cron sends it to `/api/cron/receipt-photos`, the daily job (`vercel.json`) that removes scanned photos never saved with an expense once they are a day old. Without it the job refuses every call. |

### AI connector (MCP)

The MCP endpoint is `src/app/api/mcp/route.ts` (Streamable HTTP, stateless, using [`mcp-handler`](https://www.npmjs.com/package/mcp-handler)); its HTTP edge is `src/mcp/http.ts`. AI apps sign in with **OAuth through Clerk**: an unauthenticated request gets a `401` whose `WWW-Authenticate` header points to `/.well-known/oauth-protected-resource/api/mcp` (also served without the `/api/mcp` suffix), which names this app's Clerk instance as the authorization server, and the app sends the user there to sign in. Clerk's authorization server metadata is also mirrored at `/.well-known/oauth-authorization-server` (with or without `/api/mcp`) and `/.well-known/openid-configuration` for older clients that look on this domain. No new environment variables are needed. In the **Clerk dashboard**'s OAuth settings, turn on **Publish CIMD support**, so AI apps that support Client ID Metadata Documents (the current MCP standard) can connect with just the URL. Turn on **Publish DCR support** too for apps that only know the older dynamic client registration. An app that does neither and asks for a **Client ID** (Muse does) needs an OAuth application created for it in Clerk; see [Apps that ask for a Client ID](docs/mcp-ai-guide.md#apps-that-ask-for-a-client-id).

So that every client can use it, not just Claude and ChatGPT, the endpoint: accepts the `Bearer` scheme in any letter case and verifies OAuth tokens with Clerk directly; answers CORS preflights and exposes `WWW-Authenticate` and `Mcp-Session-Id`; answers clients that only accept `application/json` with plain JSON instead of an event stream; doesn't advertise tool-list changes, so 2026-era clients don't hold a `subscriptions/listen` stream open until the function times out; and advertises tool input schemas in the JSON Schema subset Gemini accepts (`src/mcp/portable-schema.ts`; no `$schema`, `const`, exclusive bounds, non-standard formats or empty objects). `tests/integration/mcp/` covers each of these.

For apps that can't do OAuth, users create a **personal API key** (`bgt_…`) on the Review page. Only a SHA-256 hash is stored; the key is shown once and can be revoked.

| Tool | Does |
| --- | --- |
| `list_categories`, `list_expenses`, `list_fixed_bills` | Read-only helpers for suggesting a category and spotting duplicates and existing bills |
| `add_expense` | Sends a charge to **Review** (`pending_expenses`), optionally `unpaid` and with a `receipt`. A saved expense or pending item with the same amount on the same day comes back as `possible_duplicate` unless `allow_duplicate` is set |
| `mark_expense_paid` | Marks an unpaid expense (saved or pending) paid on a day, so it starts coming off the bank balance |
| `attach_receipt` | Adds or replaces a receipt (details plus an optional JPEG) on an expense or pending item |
| `sync_bank_balance` | Sets the bank balance (the primary chequing account) to what the bank reported; never subtracts |
| `list_accounts` | Accounts with balances now, proposals waiting for review, net chequing and this month's leftover spend |
| `propose_account` | Proposes a new account (`pending_accounts`); nothing is created until it's approved on Review |
| `update_account_balance` | Sets one account's balance by id or institution plus last four, with an as-of time; never replaces a newer balance with an older one |
| `record_statement` | Records a statement (`account_statements`, one per account and closing date, so recording it twice changes nothing), saves its PDF privately under `statements/`, and proposes a new account when none matches |
| `record_transfer` | Records money moved between two accounts (`account_transfers`); never an expense |
| `add_fixed_bill`, `mark_bill_paid` | Adds a monthly bill (only for charges that clearly repeat, or when asked); ticks a bill paid for a month |
| `edit_fixed_bill`, `edit_expense`, `delete_expense` | Marked destructive; only when the user explicitly asks or agrees. A bill edit applies from a month on |

Unpaid expenses (`expenses.unpaid`) count as spending but stay off the bank balance until marked paid, then count by when they were paid (`paid_at`, `paid_on`). Receipts read off emails are stored like scanned ones; one without a photo has `image_pathname` null, and its 📎 on Spending isn't a link.

The instructions every client receives on connect live in `src/mcp/instructions.ts`; keep them in step with `docs/mcp-ai-guide.md`.

Receipt reading uses Claude through **Vercel AI Gateway**. On Vercel it signs in with the project's OIDC token, so no key is needed. Optional overrides:

| Variable | Effect |
| --- | --- |
| `ANTHROPIC_API_KEY` | Call the Claude API directly instead of the gateway |
| `AI_GATEWAY_API_KEY` | Use the gateway outside Vercel (local dev) |
| `RECEIPT_VISION_MODEL` | Use a different model (defaults to Claude Opus 5.5) |

With none of these available, scanning still saves the photo and opens an empty form.

The database schema lives in `src/db/schema.sql` and is applied automatically (idempotently) at the start of every build by `scripts/migrate.ts`. It skips itself when `DATABASE_URL` isn't set.

```bash
bun install
bun run db:migrate   # optional locally; build runs it too
bun dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `bun dev` | Dev server |
| `bun run build` | Migrate the database, then `next build` |
| `bun run lint` | Biome check |
| `bun run lint:fix` | Biome check with safe and unsafe fixes applied |
| `bun run format` | Biome format |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Every test (unit, component and integration) |
| `bun run test:unit` | Unit and component tests |
| `bun run test:integration` | Integration tests |
| `bun run test:watch` | Tests in watch mode |
| `bun run test:coverage` | Every test, with a coverage report in `coverage/` |

## Tests

Tests use [Vitest](https://vitest.dev) and live in `tests/`:

- **`tests/unit`** — budget math, money and month helpers, Zod schemas, the server-action wrapper, TanStack Query mutations, the Clerk proxy, and every component (Testing Library in jsdom): forms, dialogs, row menus, navigation and charts.
- **`tests/integration/mcp`** — the MCP tools against the real schema (review instead of saving, duplicate detection and override, balance sync, edits and deletes scoped to the caller) and the `/api/mcp` endpoint over HTTP with API keys and Clerk OAuth tokens, including the 401 sign-in challenge and the OAuth discovery documents.
- **`tests/integration`** — the real SQL in `src/db`, the DAL rules (edits apply from the viewed month on, stopping vs. deleting bills, rolling take-home), server actions end to end, the CSV export, the migration script and every page rendered with data. They run against an in-memory Postgres ([PGlite](https://pglite.dev)) loaded with `src/db/schema.sql`, so no database or secrets are needed. Clerk is mocked, and tests check that one user can never read or change another's data.

## CI

Every pull request runs three workflows in `.github/workflows`:

| Workflow | Checks | Fails when |
| --- | --- | --- |
| `tests.yml` | **Unit tests**, **Integration tests** | Any test fails |
| `typecheck.yml` | **Type check** | `bun run typecheck` reports an error |
| `biome.yml` | **Biome** | Biome finds something it can't fix |

The Biome workflow fixes what it can (`biome check --write --unsafe`) and commits the result to the pull request as a verified `style: apply Biome fixes` commit, then re-runs all the checks on that commit. Pull requests from forks are checked but not fixed.

To block merging when a check fails, add a branch protection rule (or ruleset) on `main` that requires status checks to pass, and select **Unit tests**, **Integration tests**, **Type check** and **Biome**.
