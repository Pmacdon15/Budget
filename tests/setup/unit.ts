import { vi } from "vitest";

// Server actions call these after a successful write, and the cached reads in
// `src/db` call `cacheTag`/`cacheLife`. Outside Next's cache scope the real
// ones throw, so they're spies here and the tests assert on the calls.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
