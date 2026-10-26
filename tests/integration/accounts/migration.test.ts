import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schemaStatements } from "../../../scripts/schema";

/*
 * The accounts migration (src/db/migrations/2026-10-27-accounts.sql) moves
 * the single bank balance into a default chequing account. These run it on a
 * database that has everything before it, the way the live database does.
 */

const FILE = path.resolve(
  __dirname,
  "../../../src/db/migrations/2026-10-27-accounts.sql",
);

/** The migration's statements, split the way scripts/schema.ts splits them. */
const accountStatements = readFileSync(FILE, "utf8")
  .split(";")
  .map((statement) =>
    statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

/**
 * Every statement that runs before this migration (the schema, then earlier
 * migrations in name order), as the live database had them. Later migrations
 * may build on the accounts table, so they're left out.
 */
const everythingBefore = (() => {
  const all = schemaStatements();
  const first = all.indexOf(accountStatements[0] ?? "");
  if (first < 0) throw new Error("the accounts migration isn't in the schema");
  return all.slice(0, first);
})();

let db: PGlite;

async function run(statements: string[]) {
  for (const statement of statements) await db.query(statement);
}
const migrate = () => run(accountStatements);

beforeEach(async () => {
  db = new PGlite();
  await run(everythingBefore);
});

afterEach(async () => {
  await db.close();
});

const accounts = async () =>
  (
    await db.query<Record<string, unknown>>(
      `select user_id, type, name, balance_cents::int as balance_cents,
              balance_as_of, balance_source, is_primary, migrated_from_bank_balance
       from accounts order by user_id`,
    )
  ).rows;

describe("accounts migration", () => {
  it("is part of the schema every deploy runs", () => {
    for (const s of accountStatements) {
      expect(schemaStatements()).toContain(s);
    }
  });

  it("moves each bank balance into a default chequing account, keeping its amount and date", async () => {
    await db.query(
      `insert into bank_balances (user_id, balance_cents, updated_at) values
         ('user_a', 125050, '2026-10-20T18:00:00Z'),
         ('user_b', -12345, '2026-10-22T09:30:00Z')`,
    );
    await migrate();
    expect(await accounts()).toEqual([
      {
        user_id: "user_a",
        type: "chequing",
        name: "Chequing",
        balance_cents: 125_050,
        balance_as_of: new Date("2026-10-20T18:00:00Z"),
        balance_source: "migrated",
        is_primary: true,
        migrated_from_bank_balance: true,
      },
      {
        user_id: "user_b",
        type: "chequing",
        name: "Chequing",
        balance_cents: -12_345,
        balance_as_of: new Date("2026-10-22T09:30:00Z"),
        balance_source: "migrated",
        is_primary: true,
        migrated_from_bank_balance: true,
      },
    ]);
    // The old row is left as it was, linked to its account.
    const { rows } = await db.query<Record<string, unknown>>(
      "select balance_cents::int as c, account_id is not null as linked from bank_balances order by user_id",
    );
    expect(rows).toEqual([
      { c: 125_050, linked: true },
      { c: -12_345, linked: true },
    ]);
  });

  it("keeps expenses and every other table's data", async () => {
    await db.query(
      `insert into expenses (user_id, month, spent_on, description, category, amount_cents)
       values ('user_a', '2026-10', '2026-10-20', 'Shell', 'Transportation', 4567)`,
    );
    await db.query(
      `insert into bank_balances (user_id, balance_cents) values ('user_a', 1000)`,
    );
    await migrate();
    const { rows } = await db.query(
      "select description, amount_cents from expenses",
    );
    expect(rows).toEqual([{ description: "Shell", amount_cents: 4567 }]);
  });

  it("is safe to run on every deploy: no second account", async () => {
    await db.query(
      `insert into bank_balances (user_id, balance_cents) values ('user_a', 1000)`,
    );
    await migrate();
    await migrate();
    await migrate();
    expect(await accounts()).toHaveLength(1);
  });

  it("carries over a newer balance the old app saved after the copy", async () => {
    await db.query(
      `insert into bank_balances (user_id, balance_cents, updated_at)
       values ('user_a', 1000, '2026-10-20T18:00:00Z')`,
    );
    await migrate();
    // The live app, still on bank_balances, saves a new balance.
    await db.query(
      `update bank_balances set balance_cents = 777, updated_at = '2026-10-25T18:00:00Z'`,
    );
    await migrate();
    expect(await accounts()).toMatchObject([
      { balance_cents: 777, balance_as_of: new Date("2026-10-25T18:00:00Z") },
    ]);
  });

  it("never replaces a newer account balance with the old one", async () => {
    await db.query(
      `insert into bank_balances (user_id, balance_cents, updated_at)
       values ('user_a', 1000, '2026-10-20T18:00:00Z')`,
    );
    await migrate();
    await db.query(
      `update accounts set balance_cents = 5000, balance_as_of = '2026-10-26T18:00:00Z'`,
    );
    await migrate();
    expect(await accounts()).toMatchObject([{ balance_cents: 5_000 }]);
  });

  it("doesn't bring back an account the user deleted", async () => {
    await db.query(
      `insert into bank_balances (user_id, balance_cents) values ('user_a', 1000)`,
    );
    await migrate();
    await db.query("delete from accounts");
    await migrate();
    expect(await accounts()).toEqual([]);
  });

  it("leaves a user who already has accounts alone", async () => {
    await run(accountStatements.slice(0, 1)); // the accounts table
    await db.query(
      `insert into accounts (user_id, type, name, balance_cents, is_primary)
       values ('user_a', 'chequing', 'Everyday', 2000, true)`,
    );
    await db.query(
      `insert into bank_balances (user_id, balance_cents, updated_at)
       values ('user_a', 1000, '2000-01-01T00:00:00Z')`,
    );
    await migrate();
    expect(await accounts()).toMatchObject([
      { name: "Everyday", balance_cents: 2_000 },
    ]);
  });

  it("does nothing for a user who never entered a balance", async () => {
    await migrate();
    expect(await accounts()).toEqual([]);
  });
});
