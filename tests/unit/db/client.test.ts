import { beforeEach, describe, expect, it, vi } from "vitest";

const neon = vi.hoisted(() => vi.fn((url: string) => ({ url })));
vi.mock("@neondatabase/serverless", () => ({ neon }));

async function freshClient() {
  vi.resetModules();
  return import("@/db/client");
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("POSTGRES_URL", undefined);
});

describe("db()", () => {
  it("connects to DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://neon.test/budget");
    const { db } = await freshClient();
    expect(db()).toEqual({ url: "postgres://neon.test/budget" });
  });

  it("falls back to POSTGRES_URL", async () => {
    vi.stubEnv("POSTGRES_URL", "postgres://vercel.test/budget");
    const { db } = await freshClient();
    expect(db()).toEqual({ url: "postgres://vercel.test/budget" });
  });

  it("reuses one client", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://neon.test/budget");
    const { db } = await freshClient();
    expect(db()).toBe(db());
    expect(neon).toHaveBeenCalledOnce();
  });

  it("explains how to fix a missing database", async () => {
    const { db } = await freshClient();
    expect(() => db()).toThrow(
      "DATABASE_URL is not set. Connect a Neon database to this project in Vercel.",
    );
    expect(neon).not.toHaveBeenCalled();
  });
});
