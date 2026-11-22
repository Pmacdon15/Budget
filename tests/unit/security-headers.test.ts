import { describe, expect, it, vi } from "vitest";
import {
  buildSecurityHeaders,
  CSP_REPORT_PATH,
  EMAIL_CONTENT_SECURITY_POLICY,
  EMAIL_RECEIPT_ROUTES,
  enforcedDirectiveNames,
  enforcedPolicy,
  reportOnlyPolicy,
} from "@/lib/security-headers";
import { configuredIssuer } from "@/mcp/oauth-config";
import nextConfig from "../../next.config";

async function configuredHeaders() {
  const rules = (await nextConfig.headers?.()) ?? [];
  const catchAll = rules.find((rule) => rule.source === "/:path*");
  return new Map(catchAll?.headers.map(({ key, value }) => [key, value]));
}

const asMap = (headers: { key: string; value: string }[]) =>
  new Map(headers.map(({ key, value }) => [key, value]));

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

  it("blocks base-tag hijacking, form hijacking, and plugin content", async () => {
    const csp = (await configuredHeaders()).get("Content-Security-Policy");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("enforces HTTPS with HSTS and disables DNS prefetching", async () => {
    const headers = await configuredHeaders();
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers.get("X-DNS-Prefetch-Control")).toBe("off");
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

describe("report-only content security policy", () => {
  const clerk = "https://clerk.budget.example";
  const directive = (policy: string, name: string) =>
    policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
  const sources = (policy: string, name: string) =>
    directive(policy, name).split(" ").slice(1);

  it("is sent on every route, with a report endpoint", async () => {
    const headers = await configuredHeaders();
    expect(headers.get("Content-Security-Policy-Report-Only")).toBe(
      reportOnlyPolicy(configuredIssuer()),
    );
    expect(headers.get("Reporting-Endpoints")).toBe(
      `csp-endpoint="${CSP_REPORT_PATH}"`,
    );
    const policy = reportOnlyPolicy(clerk);
    expect(policy).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(policy).toContain("report-to csp-endpoint");
  });

  it("limits scripts to this app, Clerk, Turnstile and Stripe, without nonces", () => {
    const policy = reportOnlyPolicy(clerk, { dev: false });
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(sources(policy, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      clerk,
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
      "https://js.stripe.com",
      "https://*.js.stripe.com",
    ]);
    expect(policy).not.toContain("nonce-");
    expect(policy).not.toContain("'unsafe-eval'");
    // No scheme-wide source that would let any https: script in.
    expect(sources(policy, "script-src")).not.toContain("https:");
  });

  it("allows eval only in development", () => {
    expect(
      sources(reportOnlyPolicy(clerk, { dev: true }), "script-src"),
    ).toContain("'unsafe-eval'");
  });

  it("lets Clerk connect, frames Turnstile, and shows avatars and receipt previews", () => {
    const policy = reportOnlyPolicy(clerk);
    expect(sources(policy, "connect-src")).toEqual(
      expect.arrayContaining(["'self'", clerk, "https://api.stripe.com"]),
    );
    expect(sources(policy, "frame-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        clerk,
        "https://challenges.cloudflare.com",
      ]),
    );
    expect(directive(policy, "img-src")).toBe(
      "img-src 'self' data: blob: https://img.clerk.com",
    );
    expect(directive(policy, "worker-src")).toBe("worker-src 'self' blob:");
    expect(directive(policy, "style-src")).toBe(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(directive(policy, "font-src")).toBe("font-src 'self' data:");
  });

  it("allows Stripe's card form for Clerk Billing", () => {
    const policy = reportOnlyPolicy(clerk);
    for (const origin of [
      "https://js.stripe.com",
      "https://*.js.stripe.com",
      "https://hooks.stripe.com",
    ]) {
      expect(sources(policy, "frame-src")).toContain(origin);
    }
    expect(sources(policy, "script-src")).toContain("https://js.stripe.com");
    expect(sources(policy, "connect-src")).toContain("https://api.stripe.com");
    // Promoting frame-src to enforced carries the Stripe origins with it.
    expect(enforcedPolicy(policy, ["frame-src"])).toContain(
      "https://hooks.stripe.com",
    );
  });

  it("leaves Clerk out when no publishable key is configured", () => {
    const policy = reportOnlyPolicy(null, { dev: false });
    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.protect.clerk.com https://js.stripe.com https://*.js.stripe.com",
    );
    expect(policy).not.toContain("null");
    expect(policy).not.toContain("undefined");
  });

  it("uses the Frontend API host encoded in the publishable key", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      `pk_test_${btoa("clerk.budget.example$")}`,
    );
    expect(
      asMap(buildSecurityHeaders()).get("Content-Security-Policy-Report-Only"),
    ).toContain(
      "script-src 'self' 'unsafe-inline' https://clerk.budget.example ",
    );
  });

  it("ignores a malformed publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "not-a-key");
    const policy = asMap(buildSecurityHeaders()).get(
      "Content-Security-Policy-Report-Only",
    );
    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    );
  });
});

describe("promoting report-only directives to enforced", () => {
  const reportOnly = reportOnlyPolicy("https://clerk.example.com");
  const BASE =
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

  it("enforces only the baseline by default", () => {
    expect(enforcedDirectiveNames(undefined)).toEqual([]);
    expect(enforcedPolicy(reportOnly, [])).toBe(BASE);
    vi.stubEnv("CSP_ENFORCE_DIRECTIVES", "");
    expect(asMap(buildSecurityHeaders()).get("Content-Security-Policy")).toBe(
      BASE,
    );
  });

  it("parses CSP_ENFORCE_DIRECTIVES and ignores unknown or reporting names", () => {
    expect(
      enforcedDirectiveNames(
        " IMG-SRC, frame-src connect-src,img-src,bogus,report-uri",
      ),
    ).toEqual(["img-src", "frame-src", "connect-src"]);
  });

  it("copies the promoted directives from the report-only policy", () => {
    const policy = enforcedPolicy(reportOnly, ["img-src", "connect-src"]);
    expect(policy).toContain(
      "img-src 'self' data: blob: https://img.clerk.com",
    );
    expect(policy).toContain("connect-src 'self' https://clerk.example.com");
    expect(policy.startsWith(BASE)).toBe(true);
    expect(policy).not.toContain("script-src");
    expect(policy).not.toContain("report-uri");
  });

  it("reads the directives to promote from the env", () => {
    vi.stubEnv("CSP_ENFORCE_DIRECTIVES", "script-src");
    expect(
      asMap(
        buildSecurityHeaders({ clerkOrigin: "https://clerk.example.com" }),
      ).get("Content-Security-Policy"),
    ).toContain("script-src 'self' 'unsafe-inline' https://clerk.example.com");
  });
});

describe("saved receipt emails", () => {
  it("keep their sandboxed policy and send no reports", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const source of EMAIL_RECEIPT_ROUTES) {
      const rule = rules.find((r) => r.source === source);
      const headers = new Map(rule?.headers.map((h) => [h.key, h.value]));
      expect(headers.get("Content-Security-Policy")).toBe(
        EMAIL_CONTENT_SECURITY_POLICY,
      );
      expect(headers.get("Content-Security-Policy-Report-Only")).toBe(
        EMAIL_CONTENT_SECURITY_POLICY,
      );
    }
    expect(EMAIL_CONTENT_SECURITY_POLICY).not.toContain("report-");
  });
});
