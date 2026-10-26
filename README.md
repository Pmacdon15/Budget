# Budget

A personal monthly budgeting app — live at **[budget.patmac.ca](https://budget.patmac.ca)**.

- **Fixed bills** — rent, phone, insurance, subscriptions. Enter once, they repeat every month. Changing an amount applies from the month you're viewing onward, so past months and reports stay accurate.
- **Take-home** — record what actually landed each month (one entry per paycheque). Shows a rolling 3-month average and a 12-month trend.
- **Spending** — one-off expenses by category (including Auto, Food and Alcohol).
  - **Scan receipt** — take a photo with the camera or pick one, from the Spending page or inside any Add expense form; AI reads the store, date, total, tax and category and pre-fills the expense for you to confirm. A receipt with things from several categories (groceries and beer, say) is split into one expense per category; the AI suggests the split and you can adjust it. Any new expense can be split by hand too. The photo and everything read off it are saved with the expense (📎 opens it).
  - **Download** — expenses as **CSV**, **Excel** or **PDF** for any month range, with checkboxes to choose the categories. PDFs can include the receipt photos.
- **Overview** — this month at a glance: take-home, bills, spending, what's left, a 12-month history chart and a category breakdown.
- **Bank balance** — enter what your account shows (negative is fine when overdrawn). Every expense you add after that comes off it, so the card shows what's left in the bank, with a line like "Entered $1,000.00, less $40.00 spent since". Editing, deleting or undoing an expense keeps it right, because the debit is worked out from the expenses that exist now. Expenses added before you entered the balance are already in your bank's number, so entering a new balance starts fresh and nothing is taken off twice.
- **Monthly report** — summary vs. last month and your 12-month average, category breakdown, every line item, plus **Print / PDF** and **CSV** export.
- **AI connector** — an [MCP](https://modelcontextprotocol.io) server at `https://budget.patmac.ca/api/mcp` that Claude, Muse, Gemini or any MCP-capable assistant can connect to. Ask it to go through your email, and it suggests a category for each bill, receipt or order and checks with you, then sends it to **Review**. Nothing counts until you approve it there, where you can also edit or reject it. It can also set your bank balance from a bank alert, and edit or delete an expense when you explicitly ask. See [docs/mcp-ai-guide.md](docs/mcp-ai-guide.md) for how to connect and the rules the assistant follows.

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

The MCP endpoint is `src/app/api/mcp/route.ts` (Streamable HTTP, stateless, using [`mcp-handler`](https://www.npmjs.com/package/mcp-handler)). AI apps sign in with **OAuth through Clerk**: an unauthenticated request gets a `401` pointing to `/.well-known/oauth-protected-resource`, which names this app's Clerk instance as the authorization server, and the app sends the user there to sign in. No new environment variables are needed, but in the **Clerk dashboard** turn on **Dynamic client registration** in its OAuth applications settings, so AI apps can register themselves.

For apps that can't do OAuth, users create a **personal API key** (`bgt_…`) on the Review page. Only a SHA-256 hash is stored; the key is shown once and can be revoked.

| Tool | Does |
| --- | --- |
| `list_categories`, `list_expenses` | Read-only helpers for suggesting a category and spotting duplicates |
| `add_expense` | Sends a charge to **Review** (`pending_expenses`). A saved expense or pending item with the same amount on the same day comes back as `possible_duplicate` unless `allow_duplicate` is set |
| `sync_bank_balance` | Sets the bank balance to what the bank reported; never subtracts |
| `edit_expense`, `delete_expense` | Marked destructive; only for when the user explicitly asks |

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
