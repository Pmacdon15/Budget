import { describe, expect, it, vi } from "vitest";
import { insertApiKey, MAX_API_KEYS, revokeApiKey } from "@/db/api-keys";
import { db } from "@/db/client";
import { rows } from "../../helpers/test-db";

let n = 0;
const key = () => {
  n += 1;
  return { name: `Key ${n}`, keyHash: `hash_${n}`, keyPrefix: `bgt_${n}` };
};

const activeKeys = async (userId: string) =>
  Number(
    (
      await rows(
        "select count(*) as n from api_keys where user_id = $1 and revoked_at is null",
        [userId],
      )
    )[0]?.n,
  );

describe("insertApiKey", () => {
  it("never goes past the cap when many requests arrive at once", async () => {
    // PGlite is a single connection, so these transactions run one after
    // another rather than truly in parallel. The last test checks the lock
    // that keeps a real, multi-connection database safe when they overlap.
    const results = await Promise.all(
      Array.from({ length: MAX_API_KEYS * 2 }, () =>
        insertApiKey("user_a", key()),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(MAX_API_KEYS);
    expect(await activeKeys("user_a")).toBe(MAX_API_KEYS);
  });

  it("fills only the last free slot when it is contended", async () => {
    for (let i = 0; i < MAX_API_KEYS - 1; i++) {
      expect(await insertApiKey("user_a", key())).toBe(true);
    }
    const results = await Promise.all(
      Array.from({ length: 10 }, () => insertApiKey("user_a", key())),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await activeKeys("user_a")).toBe(MAX_API_KEYS);
  });

  it("frees a slot when a key is revoked, and counts each user separately", async () => {
    for (let i = 0; i < MAX_API_KEYS; i++) await insertApiKey("user_a", key());
    expect(await insertApiKey("user_a", key())).toBe(false);
    expect(await insertApiKey("user_b", key())).toBe(true);

    const [first] = await rows(
      "select id from api_keys where user_id = 'user_a' limit 1",
    );
    expect(await revokeApiKey("user_a", String(first?.id))).toBe(true);
    expect(await insertApiKey("user_a", key())).toBe(true);
    expect(await insertApiKey("user_a", key())).toBe(false);
    expect(await activeKeys("user_a")).toBe(MAX_API_KEYS);
  });

  it("takes a per-user lock, in the same READ COMMITTED transaction, before counting", async () => {
    const sql = db();
    const spy = vi.spyOn(sql, "transaction");
    try {
      await insertApiKey("user_a", key());
      expect(spy).toHaveBeenCalledTimes(1);
      const [build, options] = spy.mock.calls[0] ?? [];
      expect(options).toEqual({ isolationLevel: "ReadCommitted" });
      const queries = (
        build as unknown as (tag: unknown) => { text: string }[]
      )((strings: TemplateStringsArray) => ({ text: strings.join("$") }));
      expect(queries).toHaveLength(2);
      expect(queries[0]?.text).toMatch(/pg_advisory_xact_lock/);
      expect(queries[1]?.text).toMatch(/insert into api_keys/);
      expect(queries[1]?.text).toMatch(/count\(\*\)/);
    } finally {
      spy.mockRestore();
    }
  });
});
