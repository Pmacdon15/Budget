-- Bank balance: what's in the user's account right now, as they last entered
-- it. One row per user. It can be below zero when the account is overdrawn,
-- so unlike every other amount it has no "not negative" check.
create table if not exists bank_balances (
  user_id text primary key,
  balance_cents bigint not null,
  updated_at timestamptz not null default now()
);
