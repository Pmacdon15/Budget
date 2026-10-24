import { PGlite } from "@electric-sql/pglite";
import { readSchema } from "../../scripts/schema";

/**
 * An in-memory Postgres (PGlite) that runs the real schema (`src/db/schema.sql`
 * plus `src/db/migrations/*.sql`), plus
 * an adapter shaped like the Neon `sql` tag the app uses, so integration tests
 * exercise the app's actual SQL without a network database.
 */

type Row = Record<string, unknown>;
type Query = { text: string; params: unknown[] };

export const SCHEMA = readSchema();

let pg: PGlite | undefined;

export async function startTestDb() {
  if (!pg) {
    pg = new PGlite();
    await pg.exec(SCHEMA);
  }
  return pg;
}

export function testPg() {
  if (!pg) throw new Error("startTestDb() has not run yet");
  return pg;
}

/** Empties every table, including ones added by later migrations. */
export async function resetTestDb() {
  const { rows } = await testPg().query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.table_name}"`).join(", ");
  await testPg().exec(`truncate ${tables} cascade`);
}

function toQuery(strings: TemplateStringsArray, values: unknown[]): Query {
  let text = strings[0] ?? "";
  values.forEach((_value, i) => {
    text += `$${i + 1}${strings[i + 1] ?? ""}`;
  });
  return { text, params: values };
}

async function run(query: Query) {
  const result = await testPg().query<Row>(query.text, query.params);
  return result.rows;
}

/** Mirrors the parts of Neon's `sql` function that the app calls. */
export function neonLikeSql() {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(toQuery(strings, values));

  return Object.assign(sql, {
    query: (text: string, params: unknown[] = []) => run({ text, params }),
    transaction: (
      build: (
        tx: (strings: TemplateStringsArray, ...values: unknown[]) => Query,
      ) => Query[],
    ) =>
      testPg().transaction(async (tx) => {
        const results: Row[][] = [];
        for (const query of build((s, ...v) => toQuery(s, v))) {
          results.push((await tx.query<Row>(query.text, query.params)).rows);
        }
        return results;
      }),
  });
}

export async function rows(sql: string, params: unknown[] = []) {
  return (await testPg().query<Row>(sql, params)).rows;
}
