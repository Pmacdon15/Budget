-- Expenses not paid yet: an order waiting on a bank transfer, say. An unpaid
-- expense still counts as spending, but stays off the bank balance until it
-- is marked paid. paid_at is when it was marked paid and paid_on the day the
-- money left, so the balance takes it off only when that comes after the
-- balance was set. No semicolons in these comments: scripts/schema.ts splits
-- statements on them.
alter table expenses add column if not exists unpaid boolean not null default false;
alter table expenses add column if not exists paid_at timestamptz;
alter table expenses add column if not exists paid_on date;

-- The same for items waiting on the Review page, which carry these over when
-- approved. receipt holds what an AI read off an emailed receipt (merchant,
-- purchased_on, subtotal_cents, tax_cents, total_cents, raw_text and an
-- optional image_pathname), saved as a receipts row on approval.
alter table pending_expenses add column if not exists unpaid boolean not null default false;
alter table pending_expenses add column if not exists paid_at timestamptz;
alter table pending_expenses add column if not exists paid_on date;
alter table pending_expenses add column if not exists receipt jsonb;
