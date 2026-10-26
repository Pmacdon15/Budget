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
