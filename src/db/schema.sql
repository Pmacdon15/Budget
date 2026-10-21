-- Budget schema. Idempotent: safe to run on every deploy.
-- Money is stored as integer cents. Months are 'YYYY-MM' strings so they sort correctly.

create table if not exists fixed_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  category text not null,
  amount_cents integer not null check (amount_cents >= 0),
  due_day smallint check (due_day between 1 and 31),
  start_month char(7) not null,
  end_month char(7),
  created_at timestamptz not null default now()
);
create index if not exists fixed_items_user_idx on fixed_items (user_id, start_month);

create table if not exists income (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  month char(7) not null,
  label text not null,
  amount_cents integer not null check (amount_cents >= 0),
  received_on date,
  created_at timestamptz not null default now()
);
create index if not exists income_user_month_idx on income (user_id, month);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  month char(7) not null,
  spent_on date not null,
  description text not null,
  category text not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_month_idx on expenses (user_id, month);
