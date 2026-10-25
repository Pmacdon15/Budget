-- Receipt scans per user per window, so `POST /api/receipts` can refuse a
-- scan before it stores a photo or calls the AI. One row per user, period
-- ('hour' or 'day') and window start (UTC). Old windows are pruned as new
-- scans are counted.
create table if not exists receipt_scan_counts (
  user_id text not null,
  period text not null check (period in ('hour', 'day')),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, period, window_start)
);
