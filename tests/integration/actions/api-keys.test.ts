import { describe, expect, it } from "vitest";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";
import { getApiKeys, MAX_API_KEYS } from "@/dal/api-keys";
import { hashApiKey } from "@/lib/api-key-token";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

async function create(name = "Muse") {
  const result = await createApiKey({ name });
  if (!result.ok) throw new Error(result.error);
  return result.key;
}

describe("API key actions", () => {
  it("returns the key once and stores only its hash", async () => {
    const key = await create();
    expect(key).toMatch(/^bgt_/);
    const stored = await rows("select * from api_keys");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      user_id: "user_a",
      name: "Muse",
      key_hash: hashApiKey(key),
      key_prefix: key.slice(0, 10),
    });
    expect(JSON.stringify(stored)).not.toContain(key);
  });

  it("lists keys without the key itself", async () => {
    const key = await create();
    const keys = await getApiKeys();
    expect(keys).toEqual([
      {
        id: expect.any(String),
        name: "Muse",
        prefix: key.slice(0, 10),
        createdAt: expect.any(String),
        lastUsedAt: null,
      },
    ]);
    expect(JSON.stringify(keys)).not.toContain(key);
  });

  it("needs a name", async () => {
    expect(await createApiKey({ name: " " })).toMatchObject({ ok: false });
    expect(await rows("select * from api_keys")).toHaveLength(0);
  });

  it("revokes a key so it no longer lists", async () => {
    await create();
    const [key] = await getApiKeys();
    expect(await revokeApiKey(String(key?.id))).toEqual({ ok: true });
    expect(await getApiKeys()).toEqual([]);
    expect(await revokeApiKey(String(key?.id))).toMatchObject({ ok: false });
  });

  it("keeps each user's keys separate", async () => {
    await create("Mine");
    const [mine] = await getApiKeys();
    signInAs("user_b");
    expect(await getApiKeys()).toEqual([]);
    expect(await revokeApiKey(String(mine?.id))).toMatchObject({ ok: false });
    signInAs("user_a");
    expect(await getApiKeys()).toHaveLength(1);
  });

  it("refuses when signed out", async () => {
    signOut();
    expect(await createApiKey({ name: "x" })).toMatchObject({ ok: false });
    expect(await rows("select * from api_keys")).toHaveLength(0);
  });

  it("caps active keys per user at MAX_API_KEYS until one is revoked", async () => {
    for (let i = 0; i < MAX_API_KEYS; i++) {
      await create(`Key ${i + 1}`);
    }
    expect(await getApiKeys()).toHaveLength(MAX_API_KEYS);

    expect(await createApiKey({ name: "Overflow" })).toEqual({
      ok: false,
      error: `You can have at most ${MAX_API_KEYS} active API keys. Revoke one you no longer use first.`,
    });

    const [first] = await getApiKeys();
    expect(await revokeApiKey(String(first?.id))).toEqual({ ok: true });
    await expect(create("Replacement")).resolves.toMatch(/^bgt_/);
    expect(await getApiKeys()).toHaveLength(MAX_API_KEYS);
  });
});
