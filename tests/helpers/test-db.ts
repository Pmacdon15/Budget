import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * An in-memory Postgres (PGlite) that runs the real `src/db/schema.sql`, plus
 * an adapter shaped like the Neon `sql` tag the app uses, so integration tests
 * exercise the app's actual SQL without a network database.
 */

type Row = Record<string, unknown>;
type Query = { text: string; params: unknown[] };

export const SCHEMA = readFileSync(
  join(process.cwd(), "src/db/schema.sql"),
  "utf8",
);

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

export async function resetTestDb() {
  await testPg().exec("truncate fixed_items, income, expenses");
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
