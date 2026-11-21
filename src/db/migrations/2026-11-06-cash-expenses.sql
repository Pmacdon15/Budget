-- Spending paid in cash: it came out of no bank or card account. It counts in
-- category and monthly spending like any other expense, but never changes an
-- account balance. No semicolons in these comments: scripts/schema.ts splits
-- statements on them.
--
-- An empty account_id already means the primary chequing account (see
-- 2026-10-29-expense-accounts.sql), so cash needs its own flag. A cash
-- expense always has an empty account_id.
alter table expenses add column if not exists paid_cash boolean not null default false;

-- What the user told the AI, carried over to the expense on approval.
alter table pending_expenses add column if not exists paid_cash boolean not null default false;
