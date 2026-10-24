# Budget

A personal monthly budgeting app — live at **[budget.patmac.ca](https://budget.patmac.ca)**.

- **Fixed bills** — rent, phone, insurance, subscriptions. Enter once, they repeat every month. Changing an amount applies from the month you're viewing onward, so past months and reports stay accurate.
- **Take-home** — record what actually landed each month (one entry per paycheque). Shows a rolling 3-month average and a 12-month trend.
- **Spending** — one-off expenses by category.
- **Overview** — this month at a glance: take-home, bills, spending, what's left, a 12-month history chart and a category breakdown.
- **Monthly report** — summary vs. last month and your 12-month average, category breakdown, every line item, plus **Print / PDF** and **CSV** export.

## Stack

Next.js 16 (App Router, `src/`, React Compiler, Cache Components) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) + Recharts · Biome · Bun · Clerk (auth) · Neon Postgres.

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
| `bun run format` | Biome format |
| `bun run typecheck` | `tsc --noEmit` |
