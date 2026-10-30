-- Which account an expense came out of: a chequing account, a credit card or
-- a line of credit. No semicolons in these comments: scripts/schema.ts
-- splits statements on them.
--
-- account_id empty means the primary chequing account, as before accounts
-- (every expense saved until now, and savings contributions). With more than
-- one account, the app and the MCP server ask which one before saving, so a
-- charge on a credit card is never taken off chequing.
--
-- No foreign key on purpose: deleting a credit card must not move its
-- expenses onto the primary chequing account (an empty account_id). The id
-- of a deleted account simply matches no account any more.
alter table expenses add column if not exists account_id uuid;
create index if not exists expenses_account_idx on expenses (account_id);

-- The account an AI said a charge was paid from, after the user confirmed
-- it. Carried over to the expense on approval. Empty on an item sent before
-- accounts were asked for: approving it then needs the user to pick one when
-- they have more than one account.
alter table pending_expenses add column if not exists account_id uuid;
