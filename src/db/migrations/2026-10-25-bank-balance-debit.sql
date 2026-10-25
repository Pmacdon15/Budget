-- Bank balance debiting: the balance shown is the one last entered, less the
-- caller's expenses added after it. This index keeps that sum to the caller's
-- newest expenses.
create index if not exists expenses_user_created_idx on expenses (user_id, created_at);
