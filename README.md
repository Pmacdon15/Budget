# Budget

A personal monthly budgeting app — live at **[budget.patmac.ca](https://budget.patmac.ca)**.

- **Fixed bills** — rent, phone, insurance, subscriptions. Enter once, they repeat every month. Changing an amount applies from the month you're viewing onward, so past months and reports stay accurate.
- **Take-home** — record what actually landed each month (one entry per paycheque). Shows a rolling 3-month average and a 12-month trend.
- **Spending** — one-off expenses by category (including Auto, Food and Alcohol).
  - **Scan receipt** — take a photo with the camera or pick one, from the Spending page or inside any Add expense form; AI reads the store, date, total, tax and category and pre-fills the expense for you to confirm. A receipt with things from several categories (groceries and beer, say) is split into one expense per category; the AI suggests the split and you can adjust it. Any new expense can be split by hand too. The photo and everything read off it are saved with the expense (📎 opens it).
  - **Download** — expenses as **CSV**, **Excel** or **PDF** for any month range, with checkboxes to choose the categories. PDFs can include the receipt photos.
- **Overview** — this month at a glance: take-home, bills, spending, what's left, a 12-month history chart and a category breakdown.
- **Monthly report** — summary vs. last month and your 12-month average, category breakdown, every line item, plus **Print / PDF** and **CSV** export.

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
