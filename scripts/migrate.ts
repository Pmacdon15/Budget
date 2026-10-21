import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!url) {
  console.warn("[migrate] No DATABASE_URL set — skipping migrations.");
  process.exit(0);
}

const sql = neon(url);
const schema = readFileSync(join(import.meta.dir, "../src/db/schema.sql"), "utf8");

const statements = schema
  .split(";")
  .map((statement) =>
    statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`[migrate] Applied ${statements.length} statements.`);
