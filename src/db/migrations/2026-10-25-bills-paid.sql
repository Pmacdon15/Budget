-- Bills marked paid: one row per fixed bill per month it was paid. Optional
-- bookkeeping only: a bill counts toward its month's costs whether or not it's
-- marked paid, so nothing here changes any total (or fixed_items itself).
create table if not exists fixed_item_payments (
  user_id text not null,
  fixed_item_id uuid not null references fixed_items (id) on delete cascade,
  month char(7) not null,
  created_at timestamptz not null default now(),
  primary key (fixed_item_id, month)
);
create index if not exists fixed_item_payments_user_month_idx on fixed_item_payments (user_id, month);
