-- Files each user has put in the private Blob store per UTC day (receipt
-- photos, receipt files and statement PDFs), so every write path can refuse
-- before it stores anything once the day's count or bytes run out. One row per
-- user and day. Old days are pruned as new uploads are counted.
create table if not exists receipt_upload_counts (
  user_id text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  bytes bigint not null default 0 check (bytes >= 0),
  primary key (user_id, window_start)
);
