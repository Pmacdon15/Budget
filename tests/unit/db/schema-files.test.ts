import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSchema, schemaStatements } from "../../../scripts/schema";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "budget-schema-"));
  mkdirSync(join(root, "src/db"), { recursive: true });
  writeFileSync(
    join(root, "src/db/schema.sql"),
    "-- base\ncreate table if not exists a (id int);\n",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scripts/schema.ts", () => {
  it("is just schema.sql when there are no migrations", () => {
    expect(readSchema(root)).toBe(
      "-- base\ncreate table if not exists a (id int);\n",
    );
    expect(schemaStatements(root)).toEqual([
      "create table if not exists a (id int)",
    ]);
  });

  it("adds every .sql migration after schema.sql, in name order", () => {
    const dir = join(root, "src/db/migrations");
    mkdirSync(dir);
    // A file without a trailing semicolon must not merge into the next one.
    writeFileSync(
      join(dir, "2026-10-25-c.sql"),
      "create table if not exists c (id int)",
    );
    writeFileSync(
      join(dir, "2026-10-24-b.sql"),
      "-- adds b\ncreate table if not exists b (id int)",
    );
    writeFileSync(join(dir, "README.md"), "not sql; ignored");

    expect(schemaStatements(root)).toEqual([
      "create table if not exists a (id int)",
      "create table if not exists b (id int)",
      "create table if not exists c (id int)",
    ]);
  });
});
