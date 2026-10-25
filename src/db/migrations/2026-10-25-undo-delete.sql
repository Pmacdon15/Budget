-- Undo after delete: what a delete (or a bill being stopped) removed, kept for
-- a few minutes so the toast's Undo can put it back exactly as it was.
-- record is the removed (or, for a stopped bill, the original) row as JSON;
-- receipt is the expense's receipt row, so a restored expense keeps its link.
-- image_pathname is a receipt photo the delete orphaned: it is removed from
-- storage only once the undo window has passed, not at delete time.
create table if not exists undo_deletes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('expense', 'fixed_item', 'income')),
  record jsonb not null,
  receipt jsonb,
  image_pathname text,
  created_at timestamptz not null default now()
);
create index if not exists undo_deletes_user_idx on undo_deletes (user_id, created_at);
