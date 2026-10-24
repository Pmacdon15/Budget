import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const target = vi.hoisted(() => ({
  db: undefined as { query: (sql: string) => Promise<unknown> } | undefined,
  urls: [] as string[],
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (url: string) => {
    target.urls.push(url);
    return { query: (sql: string) => target.db?.query(sql) };
  },
}));

async function runMigrate() {
  vi.resetModules();
  await import("../../scripts/migrate");
}

beforeEach(() => {
  target.urls = [];
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("POSTGRES_URL", undefined);
});

afterEach(async () => {
  await (target.db as PGlite | undefined)?.close();
  target.db = undefined;
});

describe("scripts/migrate.ts", () => {
  it("applies every statement in schema.sql to an empty database", async () => {
    const db = new PGlite();
    target.db = db;
    vi.stubEnv("DATABASE_URL", "postgres://neon.test/budget");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runMigrate();

    expect(target.urls).toEqual(["postgres://neon.test/budget"]);
    expect(log).toHaveBeenCalledWith("[migrate] Applied 10 statements.");
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "expenses",
      "fixed_items",
      "income",
      "receipts",
    ]);
  });

  it("is safe to run again on an existing database", async () => {
    target.db = new PGlite();
    vi.stubEnv("DATABASE_URL", "postgres://neon.test/budget");
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runMigrate();
    await expect(runMigrate()).resolves.toBeUndefined();
  });

  it("falls back to POSTGRES_URL", async () => {
    target.db = new PGlite();
    vi.stubEnv("POSTGRES_URL", "postgres://vercel.test/budget");
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runMigrate();
    expect(target.urls).toEqual(["postgres://vercel.test/budget"]);
  });

  it("skips itself when no database is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    await expect(runMigrate()).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(0);
    expect(warn).toHaveBeenCalledWith(
      "[migrate] No DATABASE_URL set — skipping migrations.",
    );
    expect(target.urls).toEqual([]);
  });
});
