import { describe, expect, it } from "vitest";
import { rows, SCHEMA, testPg } from "../../helpers/test-db";

describe("schema", () => {
  it("creates the original tables", async () => {
    const tables = await rows(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    );
    // Migrations in src/db/migrations may add more.
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(["expenses", "fixed_items", "income", "receipts"]),
    );
  });

  it("is idempotent, so it is safe to run on every deploy", async () => {
    await testPg().exec(SCHEMA);
    await testPg().exec(SCHEMA);
  });

  it("rejects negative amounts", async () => {
    await expect(
      testPg().query(
        `insert into expenses (user_id, month, spent_on, description, category, amount_cents)
         values ('u', '2026-10', '2026-10-01', 'x', 'Other', -1)`,
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("rejects an impossible due day", async () => {
    await expect(
      testPg().query(
        `insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month)
         values ('u', 'x', 'Other', 1, 32, '2026-10')`,
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("generates ids and timestamps", async () => {
    const [row] = await rows(
      `insert into income (user_id, month, label, amount_cents)
       values ('u', '2026-10', 'Pay', 1) returning id, created_at`,
    );
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.created_at).toBeInstanceOf(Date);
  });
});
