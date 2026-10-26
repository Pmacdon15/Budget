-- AI connector (the MCP server at /api/mcp).
--
-- pending_expenses: expenses an AI assistant found (in the user's email, say)
-- and submitted. They wait here until the user approves them on the Review
-- page, which turns each into a normal expense, or rejects them. merchant is
-- who was paid, source is where the AI found it (an email's sender and
-- subject), and client is which AI app submitted it. No semicolons in these
-- comments: scripts/schema.ts splits statements on them.
create table if not exists pending_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  spent_on date not null,
  description text not null,
  merchant text,
  category text not null,
  amount_cents integer not null check (amount_cents > 0),
  source text,
  client text,
  created_at timestamptz not null default now()
);
create index if not exists pending_expenses_user_idx on pending_expenses (user_id, created_at);
create index if not exists pending_expenses_user_spent_on_idx on pending_expenses (user_id, spent_on);

-- api_keys: personal keys for AI apps that can't sign in with OAuth. Only a
-- SHA-256 hash of each key is stored. The key itself is shown once, when it is
-- created. key_prefix is its first characters, so the user can tell keys apart.
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_user_idx on api_keys (user_id, created_at);
