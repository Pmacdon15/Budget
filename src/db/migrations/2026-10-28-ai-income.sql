-- Income an AI finds in email: an e-Transfer someone sent the user, a direct
-- deposit or a client's payment. Like expenses, it waits on the Review page
-- (pending_income) until the user approves it, and only then becomes a
-- take-home entry (income). No semicolons in these comments: scripts/schema.ts
-- splits statements on them.
--
-- receipt is the copy of the email (or its PDF) the AI sent, in the same JSON
-- shape as pending_expenses.receipt. Approving saves it as a receipts row,
-- linked from income.receipt_id, so the user can open and download it.
-- account_id is the account the money went into (chequing or savings). Left
-- empty, approving uses the primary chequing account.
create table if not exists pending_income (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  received_on date not null,
  label text not null,
  payer text,
  amount_cents integer not null check (amount_cents > 0),
  account_id uuid references accounts (id) on delete set null,
  source text,
  client text,
  receipt jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pending_income_user_idx on pending_income (user_id, created_at);

-- A take-home entry can keep the receipt it came with, say who paid it and
-- where it was found, and name the account it went into. Entries the user
-- typed in have none of these, so they're unchanged.
--
-- An entry with account_id raises that account's balance when it came after
-- the balance (added after balance_as_of and dated on or after its day), the
-- same rule expenses and transfers follow. So approving January's deposits
-- in October never changes October's balance, which already holds them.
alter table income add column if not exists receipt_id uuid references receipts (id) on delete set null;
alter table income add column if not exists account_id uuid references accounts (id) on delete set null;
alter table income add column if not exists payer text;
alter table income add column if not exists source text;
create index if not exists income_receipt_idx on income (receipt_id);
create index if not exists income_account_idx on income (account_id);
create index if not exists income_user_created_idx on income (user_id, created_at);
