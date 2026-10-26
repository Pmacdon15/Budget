import { beforeAll, beforeEach, vi } from "vitest";
import { clerkOAuth, signInAs } from "../helpers/auth";
import { resetTestDb, startTestDb } from "../helpers/test-db";

// The app's Neon client is swapped for an in-memory Postgres running the real schema.
vi.mock("@/db/client", async () => {
  const { neonLikeSql } = await import("../helpers/test-db");
  const sql = neonLikeSql();
  return { db: () => sql };
});

vi.mock("@clerk/nextjs/server", async () => {
  const { authState, clerkOAuth } = await import("../helpers/auth");
  return {
    auth: vi.fn(async () => ({ userId: authState.userId })),
    // The MCP endpoint asks Clerk about OAuth access tokens directly.
    clerkClient: vi.fn(async () => ({
      authenticateRequest: vi.fn(async (request: Request) =>
        clerkOAuth.authenticate(request),
      ),
    })),
  };
});

vi.mock("next/navigation", async () => {
  const { RedirectError } = await import("../helpers/auth");
  return {
    redirect: vi.fn((url: string) => {
      throw new RedirectError(url);
    }),
    // For client components rendered inside pages (the Spending search form).
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/link", async () => import("../stubs/next-link"));

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  signInAs("user_a");
  clerkOAuth.reset();
});
