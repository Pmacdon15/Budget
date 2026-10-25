-- Duplicate detection: before a new expense is saved, the app looks for one on
-- the same day with the same total. This index keeps that lookup to the
-- caller's expenses on that date.
create index if not exists expenses_user_spent_on_idx on expenses (user_id, spent_on);
