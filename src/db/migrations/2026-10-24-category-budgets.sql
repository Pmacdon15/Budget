-- Monthly spending limits per category.
-- A row sets the limit for its category from start_month onward, until a later
-- row replaces it, so editing a limit doesn't rewrite past months. A null
-- amount_cents removes the limit from that month on.
create table if not exists category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null,
  start_month char(7) not null,
  amount_cents integer check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category, start_month)
);
