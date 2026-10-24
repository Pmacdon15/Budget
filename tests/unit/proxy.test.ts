import { describe, expect, it, vi } from "vitest";

type Handler = (
  auth: { protect: () => Promise<void> },
  req: { url: string },
) => Promise<void>;

const captured = vi.hoisted(() => ({
  handler: undefined as Handler | undefined,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: Handler) => {
    captured.handler = handler;
    return handler;
  },
  // Same contract as Clerk's: patterns are anchored path regexes.
  createRouteMatcher: (patterns: string[]) => (req: { url: string }) => {
    const { pathname } = new URL(req.url);
    return patterns.some((p) => new RegExp(`^${p}$`).test(pathname));
  },
}));

const { config } = await import("@/proxy");

async function visit(path: string) {
  const protect = vi.fn(async () => {});
  await captured.handler?.({ protect }, { url: `https://budget.test${path}` });
  return protect;
}

describe("proxy (Clerk middleware)", () => {
  it.each([
    "/",
    "/fixed",
    "/income",
    "/expenses",
    "/report",
    "/report/csv",
  ])("requires sign-in for %s", async (path) => {
    expect(await visit(path)).toHaveBeenCalledOnce();
  });

  it.each([
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify",
  ])("leaves %s public", async (path) => {
    expect(await visit(path)).not.toHaveBeenCalled();
  });

  describe("matcher", () => {
    const [pages, api] = config.matcher.map((m) => new RegExp(`^${m}$`));

    it("runs on app pages and the CSV export", () => {
      for (const path of ["/", "/fixed", "/report", "/report/csv"]) {
        expect(pages?.test(path)).toBe(true);
      }
    });

    it("skips Next.js internals and static files", () => {
      for (const path of [
        "/_next/static/chunk.js",
        "/favicon.ico",
        "/logo.png",
        "/styles.css",
        "/budget.csv",
      ]) {
        expect(pages?.test(path)).toBe(false);
      }
    });

    it("always runs for API routes", () => {
      expect(api?.test("/api/anything")).toBe(true);
      expect(api?.test("/trpc/x")).toBe(true);
    });
  });
});
