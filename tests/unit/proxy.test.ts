import { describe, expect, it, vi } from "vitest";

type Auth = (() => Promise<{ userId: string | null }>) & {
  protect: () => Promise<void>;
};
type Handler = (
  auth: Auth,
  req: { url: string },
) => Promise<Response | undefined>;

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

async function visit(path: string, userId: string | null = null) {
  const protect = vi.fn(async () => {});
  const auth = Object.assign(
    vi.fn(async () => ({ userId })),
    { protect },
  ) as unknown as Auth;
  const response = await captured.handler?.(auth, {
    url: `https://budget.test${path}`,
  });
  return { protect, response };
}

describe("proxy (Clerk middleware)", () => {
  it.each([
    "/fixed",
    "/income",
    "/expenses",
    "/report",
    "/report/csv",
    "/api/receipts",
    "/api/cronjob",
    "/review",
    // Only the MCP endpoint itself checks its own token.
    "/api/mcp-other",
  ])("requires sign-in for %s", async (path) => {
    const { protect } = await visit(path);
    expect(protect).toHaveBeenCalledOnce();
  });

  it.each([
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify",
    "/welcome",
    // Vercel Cron; the route checks CRON_SECRET itself.
    "/api/cron/receipt-photos",
    // The MCP server checks its own OAuth token or API key and answers 401.
    "/api/mcp",
    // OAuth discovery for MCP clients.
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/api/mcp",
    "/.well-known/oauth-authorization-server",
  ])("leaves %s public", async (path) => {
    const { protect } = await visit(path);
    expect(protect).not.toHaveBeenCalled();
  });

  describe("home page", () => {
    it("shows the public homepage at / when signed out", async () => {
      const { protect, response } = await visit("/");
      expect(protect).not.toHaveBeenCalled();
      expect(response?.headers.get("x-middleware-rewrite")).toBe(
        "https://budget.test/welcome",
      );
    });

    it("keeps / as the overview when signed in", async () => {
      const { protect, response } = await visit("/", "user_a");
      expect(protect).not.toHaveBeenCalled();
      expect(response).toBeUndefined();
    });
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
        // The PWA manifest and its icons must load without signing in.
        "/manifest.webmanifest",
        "/icon.svg",
        "/apple-icon.png",
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
