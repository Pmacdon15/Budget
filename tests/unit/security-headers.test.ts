import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function configuredHeaders() {
  const rules = (await nextConfig.headers?.()) ?? [];
  const catchAll = rules.find((rule) => rule.source === "/:path*");
  return new Map(catchAll?.headers.map(({ key, value }) => [key, value]));
}

describe("security headers", () => {
  it("applies to every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.map((rule) => rule.source)).toContain("/:path*");
  });

  it("stops other sites framing the app", async () => {
    const headers = await configuredHeaders();
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("blocks base-tag hijacking and plugin content", async () => {
    const csp = (await configuredHeaders()).get("Content-Security-Policy");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("keeps query strings out of cross-origin referrers", async () => {
    const headers = await configuredHeaders();
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("disables MIME sniffing", async () => {
    const headers = await configuredHeaders();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("allows the camera for receipts but not the mic or location", async () => {
    const headers = await configuredHeaders();
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
  });
});
