-- Receipt files: besides a JPEG photo (image_pathname), a receipt can keep a
-- copy of the bill or receipt email an AI found, so the user can view and
-- download it in Budget. file_kind says which copy file_pathname holds
-- ('pdf' for the email's PDF attachment, 'email' for the email itself, saved
-- as sanitized HTML when it had no attachment). Both live in the private
-- blob store under receipts/<user_id>/, like photos. file_name is the
-- attachment's name for downloads, file_bytes its size. The email_* columns
-- say which email it came from. email_message_id and content_hash (a sha256
-- of the file or email body) make re-attaching the same email a no-op.
-- Every column is nullable, so existing receipts are unchanged. No semicolons
-- in these comments: scripts/schema.ts splits statements on them.
alter table receipts add column if not exists file_pathname text;
alter table receipts add column if not exists file_kind text;
alter table receipts add column if not exists file_name text;
alter table receipts add column if not exists file_bytes integer;
alter table receipts add column if not exists email_subject text;
alter table receipts add column if not exists email_from text;
alter table receipts add column if not exists email_date text;
alter table receipts add column if not exists email_message_id text;
alter table receipts add column if not exists content_hash text;
create index if not exists receipts_file_pathname_idx on receipts (file_pathname);
create index if not exists receipts_user_message_idx on receipts (user_id, email_message_id);
create index if not exists receipts_user_hash_idx on receipts (user_id, content_hash);

-- A fixed bill marked paid without an expense (mark_bill_paid with paid_on)
-- can carry its own receipt. A payment that has an expense keeps the receipt
-- on that expense instead. Income can take the same receipt_id column later.
alter table fixed_item_payments add column if not exists receipt_id uuid references receipts (id) on delete set null;
create index if not exists fixed_item_payments_receipt_idx on fixed_item_payments (receipt_id);
