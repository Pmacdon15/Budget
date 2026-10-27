-- Receipts the user uploads in Budget, and receipts in other currencies.
-- file_kind can now also be 'file': any other file the user uploaded (a
-- .docx, a .eml, a PNG, ...), kept as opaque bytes under
-- receipts/<user_id>/<uuid>.bin and only ever offered as a download.
-- currency is the ISO 4217 code the receipt's amounts are in (EUR on a
-- French invoice, say), read off it or sent by the AI. Null means Canadian
-- dollars or not stated. The expense keeps its own amount in CAD, which the
-- user confirms. No semicolons in these comments: scripts/schema.ts splits
-- statements on them.
alter table receipts add column if not exists currency text;
