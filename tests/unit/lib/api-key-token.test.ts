import { describe, expect, it } from "vitest";
import {
  apiKeyPrefix,
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
} from "@/lib/api-key-token";
import { apiKeyNameSchema } from "@/lib/api-keys";

describe("API key tokens", () => {
  it("makes long, random, recognisable keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(/^bgt_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(looksLikeApiKey(a)).toBe(true);
  });

  it("doesn't mistake an OAuth token for a key", () => {
    expect(looksLikeApiKey("oat_abc123")).toBe(false);
    expect(looksLikeApiKey("eyJhbGciOi.payload.sig")).toBe(false);
  });

  it("stores a one-way hash that never contains the key", () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key.slice(4, 14));
    expect(hashApiKey(generateApiKey())).not.toBe(hash);
  });

  it("shows only the first few characters", () => {
    expect(apiKeyPrefix("bgt_abcdefghijk")).toBe("bgt_abcdef");
  });
});

describe("apiKeyNameSchema", () => {
  it("needs a short name", () => {
    expect(apiKeyNameSchema.parse({ name: "  Muse " })).toEqual({
      name: "Muse",
    });
    expect(apiKeyNameSchema.safeParse({ name: "" }).success).toBe(false);
    expect(apiKeyNameSchema.safeParse({ name: "x".repeat(61) }).success).toBe(
      false,
    );
  });
});
