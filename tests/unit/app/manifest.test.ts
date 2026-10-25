import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const ROOT = path.resolve(__dirname, "../../..");
const APP_DIR = path.join(ROOT, "src/app");

describe("web app manifest", () => {
  const m = manifest();

  it("installs as a standalone app that opens on the overview", () => {
    expect(m.name).toBe("Budget");
    expect(m.short_name).toBe("Budget");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("uses the app's existing icons", () => {
    const icons = m.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      // Next serves app/icon.svg at /icon.svg and app/apple-icon.png at /apple-icon.png.
      expect(existsSync(path.join(APP_DIR, icon.src.slice(1))), icon.src).toBe(
        true,
      );
    }
    expect(icons.some((icon) => icon.sizes === "any")).toBe(true);
  });

  it("has shortcuts to signed-in pages that exist", () => {
    const shortcuts = m.shortcuts ?? [];
    expect(shortcuts.map((s) => s.url)).toContain("/expenses");
    for (const shortcut of shortcuts) {
      const page = path.join(APP_DIR, "(app)", shortcut.url, "page.tsx");
      expect(existsSync(page), `${shortcut.url} has no page`).toBe(true);
    }
  });

  it("ships no service worker, so nothing signed-in is cached offline", () => {
    expect(m).not.toHaveProperty("serviceworker");
    const publicDir = path.join(ROOT, "public");
    const files = existsSync(publicDir) ? readdirSync(publicDir) : [];
    expect(files.filter((f) => /^(sw|service-worker).*\.js$/.test(f))).toEqual(
      [],
    );
  });
});
