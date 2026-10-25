-- Savings goals: something to save toward (an emergency fund, a trip), with a
-- target amount and an optional date to reach it by.
create table if not exists savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  target_cents integer not null check (target_cents > 0),
  target_date date,
  start_month char(7) not null,
  created_at timestamptz not null default now()
);
create index if not exists savings_goals_user_idx on savings_goals (user_id);

-- Money put toward a goal is a Savings expense linked to it, so it already
-- counts as money set aside in the month's totals. Deleting a goal keeps the
-- expenses and only drops the link.
alter table expenses add column if not exists goal_id uuid references savings_goals (id) on delete set null;
create index if not exists expenses_goal_idx on expenses (goal_id);
