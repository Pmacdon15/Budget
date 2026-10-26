-- Fixed bills and subscription matching. A charge the AI finds can be matched
-- to an existing fixed bill (by merchant, amount and billing day), linked to
-- it, and used to correct an estimated amount, so a paid bill and the charge
-- that paid it are one item, never two. No semicolons in these comments:
-- scripts/schema.ts splits statements on them.

-- merchant and match_keywords are the names a charge for this bill shows up
-- under ("Google Play", "Google One"). is_estimate marks an amount the user
-- guessed, replaced by the first real charge. frequency is monthly for now.
-- series_id ties together the rows one bill is split into when its amount
-- changes from a month onward, which is the bill's amount history. Null means
-- the row starts its own series (its own id).
alter table fixed_items add column if not exists merchant text;
alter table fixed_items add column if not exists match_keywords text[] not null default '{}';
alter table fixed_items add column if not exists is_estimate boolean not null default false;
alter table fixed_items add column if not exists frequency text not null default 'monthly';
alter table fixed_items add column if not exists series_id uuid;
create index if not exists fixed_items_series_idx on fixed_items (series_id);

-- A bill marked paid now records the day the money left and how much, so it
-- comes off the bank balance like an expense. expense_id is the expense that
-- paid it, when there is one: then the expense is what comes off the balance,
-- and it no longer counts as separate spending. Rows from before this have no
-- paid_on and stay bookkeeping only.
alter table fixed_item_payments add column if not exists paid_on date;
alter table fixed_item_payments add column if not exists amount_cents integer;
alter table fixed_item_payments add column if not exists expense_id uuid references expenses (id) on delete set null;
create index if not exists fixed_item_payments_user_created_idx on fixed_item_payments (user_id, created_at);
create index if not exists fixed_item_payments_expense_idx on fixed_item_payments (expense_id);

-- The fixed bill an expense paid. Linked expenses are left out of spending
-- totals, because the bill already counts for that month.
alter table expenses add column if not exists fixed_item_id uuid references fixed_items (id) on delete set null;
create index if not exists expenses_fixed_item_idx on expenses (fixed_item_id);

-- On the Review page: the fixed bill an item pays (approving links it and marks
-- that month paid), and whether the AI thinks it's a subscription. Null means
-- it doesn't know. An approved subscription with no bill becomes a new fixed
-- bill, with the expense as its first paid month.
alter table pending_expenses add column if not exists fixed_item_id uuid references fixed_items (id) on delete set null;
alter table pending_expenses add column if not exists is_subscription boolean;
