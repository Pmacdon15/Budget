# Migrations

Each feature that changes the database adds its own file here instead of
appending to `../schema.sql`, so pull requests that each add a table don't
conflict with each other.

- Name files `YYYY-MM-DD-short-name.sql`. They run after `schema.sql`, in name
  order.
- Every statement must be idempotent (`create table if not exists`,
  `add column if not exists`), because the whole schema runs on every deploy
  (`bun run db:migrate`, part of `bun run build`).
- Integration tests load the same files, so a new table is in the test
  database automatically and `resetTestDb()` empties it between tests.
