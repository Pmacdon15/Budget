-- Cash spending. paid_cash marks an expense (or an item on Review) paid in
-- cash: it counts toward category and monthly spending like any other, but
-- it never comes off any account's balance, not even the primary chequing
-- account that an empty account_id otherwise means. account_id stays empty
-- on a cash expense. No semicolons in these comments: scripts/schema.ts
-- splits statements on them.
alter table expenses add column if not exists paid_cash boolean not null default false;
alter table pending_expenses add column if not exists paid_cash boolean not null default false
