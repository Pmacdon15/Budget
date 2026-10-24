import { readdirSync } from "node:fs";
import path from "node:path";
import { auth } from "@clerk/nextjs/server";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  pendingSearchParams,
  renderShell,
  textOf,
} from "../helpers/render-page";

/*
 * Every page in the signed-in app, found on disk, so a new page is covered
 * without touching this file. During `next build` the request (URL, cookies,
 * session) is unknown; this renders each page in that state and checks that
 * it still produces a useful static shell without reading the request.
 */

const APP_DIR = path.resolve(__dirname, "../../src/app/(app)");

function findPages(dir: string, route = ""): { route: string; file: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups `(x)` don't add a URL segment; `_private` folders aren't routes.
      if (entry.name.startsWith("_")) return [];
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      return findPages(full, route + segment);
    }
    return /^page\.(tsx|ts|jsx|js)$/.test(entry.name)
      ? [{ route: route || "/", file: full }]
      : [];
  });
}

const pages = findPages(APP_DIR);

type Page = (props: { searchParams: Promise<unknown> }) => ReactElement;

async function shellOf(file: string) {
  const { default: Page } = (await import(file)) as { default: Page };
  const element = Page({ searchParams: pendingSearchParams() });
  return renderShell(element);
}

describe("static shell", () => {
  it("finds the app's pages", () => {
    const routes = pages.map((p) => p.route);
    for (const route of ["/", "/expenses", "/fixed", "/income", "/report"]) {
      expect(routes).toContain(route);
    }
  });

  describe.each(pages)("$route", ({ file }) => {
    it("renders its shell without reading the session", async () => {
      await shellOf(file);
      // Every request-bound read sits in a hole that waits for the URL, so the
      // shell never needs to know who is signed in.
      expect(auth).not.toHaveBeenCalled();
    });

    it("puts its heading in the shell", async () => {
      const html = await shellOf(file);
      expect(html).toMatch(/<h1[\s>]/);
      expect(textOf(html).length).toBeGreaterThan(0);
    });

    it("shows no money before the data arrives", async () => {
      const text = textOf(await shellOf(file));
      expect(text).not.toMatch(/\$\d/);
    });
  });

  it("keeps the overview's card frames in the shell", async () => {
    const text = textOf(await shellOf(path.join(APP_DIR, "page.tsx")));
    for (const heading of [
      "Where your money is going this month.",
      "Take-home",
      "Fixed bills",
      "Spending",
      "Left over",
      "Last 12 months",
      "Where it went",
      "Recent spending",
    ]) {
      expect(text).toContain(heading);
    }
  });

  it("keeps the take-home page's labels and table header in the shell", async () => {
    const text = textOf(await shellOf(path.join(APP_DIR, "income/page.tsx")));
    for (const label of [
      "Rolling 3-month average",
      "Highest (12 mo)",
      "Lowest (12 mo)",
      "Take-home trend",
      "Month by month",
      "Left over",
    ]) {
      expect(text).toContain(label);
    }
  });
});
