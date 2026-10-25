-- Receipt photo cleanup: the daily job looks photos up by pathname to find the
-- ones no receipt uses, so give it an index rather than a scan per batch.
create index if not exists receipts_image_pathname_idx on receipts (image_pathname);
