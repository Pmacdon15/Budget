import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PRIVATE_PATHS, siteOrigin } from "@/lib/site";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteOrigin", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and trims trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "other.example");
    expect(siteOrigin()).toBe("https://example.com");
  });

  it("adds https to Vercel's bare production host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "budget.example.ca");
    expect(siteOrigin()).toBe("https://budget.example.ca");
  });

  it("falls back to the production domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(siteOrigin()).toBe("https://budget.patmac.ca");
  });
});

describe("robots.txt", () => {
  it("allows the public site, blocks signed-in pages and links the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://budget.test");
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(
      expect.arrayContaining(["/api/", "/review"]),
    );
    // "/" is the public homepage when signed out; never block it.
    expect(rules.disallow).not.toContain("/");
    expect(r.sitemap).toBe("https://budget.test/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("lists only public, absolute URLs on the site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://budget.test");
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://budget.test/");
    for (const url of urls) {
      const { origin, pathname } = new URL(url);
      expect(origin).toBe("https://budget.test");
      expect(PRIVATE_PATHS.some((p) => pathname.startsWith(p))).toBe(false);
    }
  });
});
