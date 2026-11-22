import { configuredIssuer } from "../mcp/oauth-config";

/**
 * Security headers sent on every response (wired up in `next.config.ts`).
 *
 * Two Content Security Policies are sent:
 *
 * - The enforced `Content-Security-Policy` is a baseline that cannot break
 *   the app's own scripts and styles: it stops other sites framing the app
 *   (clickjacking), blocks `<base>` hijacking and plugin content, and keeps
 *   form posts on this origin. Directives from the full policy are added to
 *   it only when promoted with `CSP_ENFORCE_DIRECTIVES` (see below).
 * - The full policy, with script, style, connect, image and frame origins,
 *   is sent as `Content-Security-Policy-Report-Only`. Browsers report what
 *   it would block to `/api/csp-report` without blocking anything, so a
 *   missing origin shows up in the logs instead of breaking Clerk sign-in.
 *
 * Scripts are restricted by origin, not by nonce: a nonce needs a fresh value
 * per request, which forces dynamic rendering and would throw away the
 * prerendered static shells that Cache Components gives every page. Inline
 * scripts stay allowed for the React Server Components payload, but an
 * injected `<script src="https://evil.example/x.js">` is blocked.
 *
 * Read at build time (`next.config.ts` calls `securityHeaderRules()`), so the
 * Clerk origin comes from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as built.
 */

/** Directives that are always enforced. */
const BASE_ENFORCED_DIRECTIVES = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

/** Where browsers send CSP violation reports (src/app/api/csp-report). */
export const CSP_REPORT_PATH = "/api/csp-report";
/** The Reporting API endpoint name used by `report-to`. */
export const CSP_REPORT_GROUP = "csp-endpoint";

/** Cloudflare Turnstile, Clerk's bot protection on sign-in and sign-up. */
const TURNSTILE = "https://challenges.cloudflare.com";
/** Clerk's fraud protection (part of Clerk's own default CSP). */
const CLERK_PROTECT = "https://*.protect.clerk.com";
/**
 * Stripe, for Clerk Billing. Budget doesn't use Billing today, but Clerk's
 * `<UserProfile />` shows a Billing tab with Stripe Elements whenever it's
 * turned on in the Clerk dashboard: its script and card iframe come from
 * js.stripe.com, 3D Secure and redirect-based payment methods frame
 * hooks.stripe.com, and Elements calls api.stripe.com. Clock-out (a sibling
 * app) broke its checkout by leaving these out.
 */
const STRIPE_SCRIPTS = ["https://js.stripe.com", "https://*.js.stripe.com"];

/**
 * The full policy, sent report-only. `clerkOrigin` is the Clerk Frontend API
 * (where clerk-js and Clerk's UI are loaded from and every Clerk request
 * goes); null when no publishable key is configured, in which case it's left
 * out (Clerk can't load without a key anyway).
 */
export function reportOnlyPolicy(
  clerkOrigin: string | null,
  { dev = process.env.NODE_ENV === "development" } = {},
) {
  const clerk = clerkOrigin ? [clerkOrigin] : [];
  return [
    "default-src 'self'",
    [
      "script-src 'self' 'unsafe-inline'",
      // React uses eval for debugging information in development only.
      ...(dev ? ["'unsafe-eval'"] : []),
      ...clerk,
      TURNSTILE,
      CLERK_PROTECT,
      ...STRIPE_SCRIPTS,
    ].join(" "),
    // Clerk's components and Next inject inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Clerk avatars; receipt previews are blob: object URLs.
    "img-src 'self' data: blob: https://img.clerk.com",
    // next/font self-hosts the Geist fonts.
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      ...clerk,
      TURNSTILE,
      `${CLERK_PROTECT}:*`,
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
      "https://img.clerk.com",
      "https://api.stripe.com",
    ].join(" "),
    [
      "frame-src 'self'",
      ...clerk,
      TURNSTILE,
      CLERK_PROTECT,
      ...STRIPE_SCRIPTS,
      "https://hooks.stripe.com",
    ].join(" "),
    // Clerk runs a blob: worker.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...BASE_ENFORCED_DIRECTIVES,
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join("; ");
}

/** Report-only directives that may be promoted to the enforced policy. */
export const PROMOTABLE_DIRECTIVES = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "frame-src",
  "worker-src",
  "manifest-src",
] as const;

/**
 * Directive names to enforce, from `CSP_ENFORCE_DIRECTIVES` (comma or space
 * separated, e.g. "img-src, frame-src, connect-src"). Unknown names are
 * ignored.
 */
export function enforcedDirectiveNames(
  raw = process.env.CSP_ENFORCE_DIRECTIVES,
): string[] {
  const allowed = new Set<string>(PROMOTABLE_DIRECTIVES);
  return [
    ...new Set(
      (raw ?? "")
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase())
        .filter((d) => allowed.has(d)),
    ),
  ];
}

/**
 * The enforced policy: the base directives plus any report-only directives
 * promoted with `CSP_ENFORCE_DIRECTIVES` once their reports at
 * `/api/csp-report` are clean. Promote one or two at a time.
 */
export function enforcedPolicy(
  reportOnly: string,
  promote: readonly string[],
): string {
  const promoted = reportOnly
    .split("; ")
    .filter((d) => promote.includes(d.split(" ")[0]));
  return [...BASE_ENFORCED_DIRECTIVES, ...promoted].join("; ");
}

/** Every header sent on every route, built from the current env. */
export function buildSecurityHeaders({
  clerkOrigin = configuredIssuer(),
  enforce = enforcedDirectiveNames(),
}: {
  clerkOrigin?: string | null;
  enforce?: readonly string[];
} = {}) {
  const reportOnly = reportOnlyPolicy(clerkOrigin);
  return [
    {
      key: "Content-Security-Policy",
      value: enforcedPolicy(reportOnly, enforce),
    },
    { key: "Content-Security-Policy-Report-Only", value: reportOnly },
    {
      key: "Reporting-Endpoints",
      value: `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    // Older browsers that ignore CSP `frame-ancestors`.
    { key: "X-Frame-Options", value: "DENY" },
    // Keep `?month=` and other query strings out of third-party referrers.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    // The receipt scanner opens the camera; nothing needs the mic or location.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=()",
    },
  ];
}

export const securityHeaders = buildSecurityHeaders();

/**
 * A saved bill or receipt email (`/api/receipts/.../email`). Its HTML was
 * written by whoever sent the email, so on top of being sanitized it is
 * served as a sandboxed document: no scripts, no origin (so no cookies or
 * same-origin requests), and nothing loaded from the network (no tracking
 * pixels). Links still open, in a new tab.
 */
export const EMAIL_CONTENT_SECURITY_POLICY = [
  "sandbox allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const emailHeaders = [
  { key: "Content-Security-Policy", value: EMAIL_CONTENT_SECURITY_POLICY },
  // Replaces the app's report-only policy: the email's own policy has no
  // report-uri, so a sandboxed email never sends reports.
  {
    key: "Content-Security-Policy-Report-Only",
    value: EMAIL_CONTENT_SECURITY_POLICY,
  },
  { key: "Referrer-Policy", value: "no-referrer" },
];

/** Where saved receipt emails are served. */
export const EMAIL_RECEIPT_ROUTES = [
  "/api/receipts/:id/email",
  "/api/receipts/pending/:id/email",
];

/**
 * `headers()` entries for `next.config.ts`: every route gets the set above,
 * and saved emails then get their stricter policy (a later rule's header
 * replaces an earlier one's).
 */
export function securityHeaderRules() {
  return [
    { source: "/:path*", headers: [...securityHeaders] },
    ...EMAIL_RECEIPT_ROUTES.map((source) => ({
      source,
      headers: emailHeaders,
    })),
  ];
}
