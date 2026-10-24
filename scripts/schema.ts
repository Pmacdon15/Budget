import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The full database schema: `src/db/schema.sql`, then every file in
 * `src/db/migrations/` in name order.
 *
 * New features add their own migration file (e.g.
 * `src/db/migrations/2026-10-24-category-budgets.sql`) instead of appending to
 * `schema.sql`, so pull requests that each add a table don't conflict. Every
 * file must be idempotent (`if not exists`), because all of them run on every
 * deploy.
 */
export function readSchema(root = process.cwd()) {
  const base = readFileSync(join(root, "src/db/schema.sql"), "utf8");
  const dir = join(root, "src/db/migrations");
  if (!existsSync(dir)) return base;

  const migrations = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));

  return [base, ...migrations].join("\n;\n");
}

/** The schema split into single statements, comments removed. */
export function schemaStatements(root = process.cwd()) {
  return readSchema(root)
    .split(";")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}
