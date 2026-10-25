-- Rolling unspent category budget into the next month. Optional and off by
-- default: a user without a rollover_settings row (or with enabled = false)
-- sees their budgets exactly as before.
-- start_month is the first month whose unspent money carries forward. Nothing
-- carries into it unless the user sets that amount by hand.
create table if not exists rollover_settings (
  user_id text primary key,
  enabled boolean not null default false,
  start_month char(7) not null,
  updated_at timestamptz not null default now()
);

-- Budgeted categories the user chose not to roll over. Every other budgeted
-- category rolls over while rollover is on.
create table if not exists rollover_excluded_categories (
  user_id text not null,
  category text not null,
  primary key (user_id, category)
);

-- The real amount carried into a category in a month, set by hand. It replaces
-- the calculated amount for that month, and later months carry on from it.
create table if not exists rollover_adjustments (
  user_id text not null,
  category text not null,
  month char(7) not null,
  amount_cents integer not null check (amount_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category, month)
);
