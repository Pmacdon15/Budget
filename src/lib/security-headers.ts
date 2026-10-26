/**
 * Security headers sent on every response (wired up in `next.config.ts`).
 *
 * The Content Security Policy is deliberately a baseline: it stops other
 * sites framing the app (clickjacking), blocks `<base>` hijacking and plugin
 * content, but does not restrict scripts. A strict `script-src` needs a
 * per-request nonce, which forces dynamic rendering and would throw away the
 * prerendered static shells that Cache Components gives every page.
 */
const contentSecurityPolicy = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Older browsers that ignore CSP `frame-ancestors`.
  { key: "X-Frame-Options", value: "DENY" },
  // Keep `?month=` and other query strings out of third-party referrers.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The receipt scanner opens the camera; nothing needs the mic or location.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
] as const;

/** `headers()` entries for `next.config.ts`: every route gets the set above. */
export function securityHeaderRules() {
  return [{ source: "/:path*", headers: [...securityHeaders] }];
}
