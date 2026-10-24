import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Checks the output of `next build` (run `bun run test:build`). Every page the
 * build produced is read from its manifests, so new pages are covered without
 * touching this file.
 *
 * With Cache Components, `next build` sorts pages into:
 *   ○ Static   the whole page is prerendered
 *   ◐ Partial  a static HTML shell is prerendered; small holes stream in
 *   ƒ Dynamic  the prerender came out empty, so the server renders it all
 *
 * No page may be ƒ. Pages that export `ensureStatic = "navigation"` (such as
 * `/shell-check`, the canary for the shared layouts) must be ○.
 */

const ROOT = path.resolve(__dirname, "../..");
const NEXT = path.join(ROOT, ".next");
const MANIFEST = path.join(NEXT, "prerender-manifest.json");

type Prerender = {
  routeType?: "page" | "route" | "shell";
  response?: "empty" | "initial" | "complete";
  compute?: "static" | "resuming" | "blocking";
  srcRoute?: string | null;
  fallback?: string | false | null;
};

const built = existsSync(MANIFEST);
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(NEXT, file), "utf8"));

/** The page's ○/◐/ƒ symbol, the way `next build` prints it. */
function symbolFor(entry: Prerender | undefined) {
  if (!entry) return "ƒ";
  if (entry.response === "empty" || entry.compute === "blocking") return "ƒ";
  return entry.compute === "static" ? "○" : "◐";
}

/** Pages in `src/app` that require a fully static result. */
function pagesRequiringStatic() {
  const appDir = path.join(ROOT, "src/app");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /^page\.(tsx|ts|jsx|js)$/.test(entry.name) ? [full] : [];
    });
  return walk(appDir)
    .filter((file) =>
      /export\s+const\s+ensureStatic\s*(?::[^=]+)?=\s*["']navigation["']/.test(
        readFileSync(file, "utf8"),
      ),
    )
    .map((file) =>
      path
        .relative(appDir, path.dirname(file))
        .split(path.sep)
        .filter((segment) => !/^\(.*\)$/.test(segment))
        .join("/"),
    )
    .map((route) => `/${route}`);
}

describe.skipIf(!built && !process.env.REQUIRE_BUILD)(
  "next build output",
  () => {
    it("has a build to check", () => {
      expect(built, "run `next build` before `bun run test:build`").toBe(true);
    });

    if (!built) return;

    const manifest = read<{
      routes: Record<string, Prerender>;
      dynamicRoutes: Record<string, Prerender>;
    }>("prerender-manifest.json");
    const appPaths = read<Record<string, string>>(
      "app-path-routes-manifest.json",
    );

    // Every App Router page the build knows about, e.g. "/(app)/fixed/page" → "/fixed".
    const pages = Object.entries(appPaths)
      .filter(([entry]) => entry.endsWith("/page"))
      .map(([, route]) => route)
      .filter((route) => route !== "/_global-error");

    const entryFor = (route: string) =>
      manifest.routes[route] ?? manifest.dynamicRoutes[route];

    it("built the app's pages", () => {
      for (const route of ["/", "/expenses", "/fixed", "/income", "/report"]) {
        expect(pages).toContain(route);
      }
    });

    it.each(pages)("%s has a static shell (not ƒ)", (route) => {
      const entry = entryFor(route);
      expect(entry, `${route} wasn't prerendered at all`).toBeDefined();
      expect(symbolFor(entry), `${route} came out fully dynamic`).not.toBe("ƒ");
    });

    // The prerendered HTML for a route with no dynamic segments.
    const htmlFor = (route: string) => {
      const file = path.join(
        NEXT,
        "server/app",
        `${route === "/" ? "index" : route.slice(1)}.html`,
      );
      return existsSync(file) ? readFileSync(file, "utf8") : null;
    };

    const signedInPages = pages.filter(
      (route) =>
        !route.includes("[") &&
        !route.startsWith("/_") &&
        entryFor(route)?.compute === "resuming",
    );

    it.each(
      signedInPages,
    )("%s puts its heading in the static shell, not just a loading state", (route) => {
      const html = htmlFor(route);
      expect(html, `${route} has no prerendered HTML`).not.toBeNull();
      expect(html).toMatch(/<h1[\s>]/);
    });

    const mustBeStatic = pagesRequiringStatic();

    it("includes the shell-check canary", () => {
      expect(mustBeStatic).toContain("/shell-check");
    });

    it.each(mustBeStatic)("%s is fully static (○)", (route) => {
      expect(symbolFor(manifest.routes[route])).toBe("○");
    });

    it("keeps the signed-out pages fully static", () => {
      for (const route of ["/welcome", "/sign-in", "/sign-up"]) {
        expect(symbolFor(manifest.routes[route]), route).toBe("○");
      }
    });
  },
);
