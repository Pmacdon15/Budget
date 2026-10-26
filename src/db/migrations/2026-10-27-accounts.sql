-- Accounts: chequing accounts, credit cards and lines of credit, each with
-- its own balance. They replace the single bank balance (bank_balances),
-- which is copied into a default chequing account below. No semicolons in
-- these comments: scripts/schema.ts splits statements on them.
--
-- type is chequing, credit_card or line_of_credit (savings is reserved for
-- later). balance_cents is what the bank shows. For chequing it's money in
-- the account, below zero when overdrawn. For a credit card or line of
-- credit it's what's owed, so a higher balance means the user owes more.
--
-- balance_as_of is the moment that balance was true: when it was typed in,
-- the time of a balance alert, or the start of the day after a statement's
-- closing date. Expenses and transfers count against the balance only when
-- they came after it, and an older balance never replaces a newer one.
-- balance_source says where it came from (manual, alert, statement,
-- migrated).
--
-- is_primary marks the one chequing account expenses and paid bills come off,
-- as they came off the old bank balance. migrated_from_bank_balance marks the
-- account made from a bank_balances row.
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null check (type in ('chequing', 'credit_card', 'line_of_credit', 'savings')),
  name text not null,
  institution text,
  last_four text check (last_four ~ '^[0-9]{4}$'),
  balance_cents bigint not null default 0,
  balance_as_of timestamptz not null default now(),
  balance_source text,
  credit_limit_cents bigint check (credit_limit_cents >= 0),
  available_credit_cents bigint,
  statement_balance_cents bigint,
  statement_closing_date date,
  payment_due_date date,
  minimum_payment_cents bigint check (minimum_payment_cents >= 0),
  is_primary boolean not null default false,
  migrated_from_bank_balance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on accounts (user_id, created_at);
create unique index if not exists accounts_user_primary_idx on accounts (user_id) where is_primary;

-- Statements an AI recorded from a statement email: a snapshot of the account
-- as of its closing date. One per account and closing date, so recording the
-- same statement twice changes nothing. pdf_pathname is the statement's PDF
-- in the private Vercel Blob store (statements/<user_id>/<uuid>.pdf), served
-- only through the owner-checked download route.
create table if not exists account_statements (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid not null references accounts (id) on delete cascade,
  closing_date date not null,
  balance_cents bigint not null,
  minimum_payment_cents bigint check (minimum_payment_cents >= 0),
  payment_due_date date,
  credit_limit_cents bigint check (credit_limit_cents >= 0),
  available_credit_cents bigint,
  pdf_pathname text,
  source text,
  client text,
  created_at timestamptz not null default now()
);
create unique index if not exists account_statements_closing_idx on account_statements (account_id, closing_date);
create index if not exists account_statements_user_idx on account_statements (user_id, closing_date);

-- Money moved between two of the user's accounts, such as a credit card
-- payment from chequing. It changes both balances and is never an expense, so
-- it's never counted as spending. An account that's deleted leaves the other
-- side of its transfers in place.
create table if not exists account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  from_account_id uuid references accounts (id) on delete set null,
  to_account_id uuid references accounts (id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  transferred_on date not null,
  description text,
  source text,
  client text,
  created_at timestamptz not null default now(),
  check (from_account_id is distinct from to_account_id)
);
create index if not exists account_transfers_user_idx on account_transfers (user_id, transferred_on);
create index if not exists account_transfers_from_idx on account_transfers (from_account_id);
create index if not exists account_transfers_to_idx on account_transfers (to_account_id);

-- Accounts an AI proposed (from a statement for an account Budget doesn't
-- know yet). Nothing is created until the user approves it on the Review
-- page. A statement that came with the proposal waits here too and is
-- recorded on approval.
create table if not exists pending_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null check (type in ('chequing', 'credit_card', 'line_of_credit', 'savings')),
  name text not null,
  institution text,
  last_four text check (last_four ~ '^[0-9]{4}$'),
  balance_cents bigint,
  balance_as_of timestamptz,
  balance_source text,
  credit_limit_cents bigint check (credit_limit_cents >= 0),
  available_credit_cents bigint,
  statement_closing_date date,
  statement_balance_cents bigint,
  payment_due_date date,
  minimum_payment_cents bigint check (minimum_payment_cents >= 0),
  statement_pdf_pathname text,
  source text,
  client text,
  created_at timestamptz not null default now()
);
create index if not exists pending_accounts_user_idx on pending_accounts (user_id, created_at);

-- Moving the single bank balance into a default chequing account, without
-- losing it. account_id remembers which account a bank_balances row became,
-- so the copy happens once per user, and an account the user later deletes
-- isn't brought back. The row itself is left as it was.
alter table bank_balances add column if not exists account_id uuid;

insert into accounts (user_id, type, name, balance_cents, balance_as_of, balance_source, is_primary, migrated_from_bank_balance)
select b.user_id, 'chequing', 'Chequing', b.balance_cents, b.updated_at, 'migrated', true, true
from bank_balances b
where b.account_id is null
  and not exists (select 1 from accounts a where a.user_id = b.user_id);

update bank_balances b
set account_id = a.id
from accounts a
where b.account_id is null
  and a.user_id = b.user_id
  and a.is_primary;

-- Preview deployments share the database with the live app, which keeps
-- writing bank_balances until this change ships. A balance entered there
-- after the copy is newer, so it's carried over too. Once the app writes
-- accounts instead, bank_balances stops changing and this does nothing.
update accounts a
set balance_cents = b.balance_cents,
    balance_as_of = b.updated_at,
    balance_source = 'migrated',
    updated_at = now()
from bank_balances b
where b.account_id = a.id
  and b.updated_at > a.balance_as_of
