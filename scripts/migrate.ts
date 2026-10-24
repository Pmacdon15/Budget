import { neon } from "@neondatabase/serverless";
import { schemaStatements } from "./schema";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!url) {
  console.warn("[migrate] No DATABASE_URL set — skipping migrations.");
  process.exit(0);
}

const sql = neon(url);
const statements = schemaStatements();

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`[migrate] Applied ${statements.length} statements.`);
