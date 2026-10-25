-- Repeating take-home: a paycheque expected every month from start_month
-- (until end_month, when set). Nothing here counts toward a month's totals on
-- its own: the user adds each month's deposit (at the usual amount or a
-- different one) or skips that month, so totals stay what actually landed.
create table if not exists recurring_income (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null,
  amount_cents integer not null check (amount_cents >= 0),
  start_month char(7) not null,
  end_month char(7),
  created_at timestamptz not null default now()
);
create index if not exists recurring_income_user_idx on recurring_income (user_id);

-- The deposit a month's expected paycheque became, if it was added.
alter table income add column if not exists recurring_id uuid references recurring_income (id) on delete set null;
create unique index if not exists income_recurring_month_idx on income (recurring_id, month) where recurring_id is not null;

-- Months where the user said that paycheque didn't come (or isn't counted here).
create table if not exists recurring_income_skips (
  user_id text not null,
  recurring_id uuid not null references recurring_income (id) on delete cascade,
  month char(7) not null,
  created_at timestamptz not null default now(),
  primary key (recurring_id, month)
);
