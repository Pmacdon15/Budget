/*
 * Helpers for /api/csp-report, which collects Content-Security-Policy-Report-Only
 * violations so the full policy in src/lib/security-headers.ts can be tuned
 * before it's enforced. Browsers send either the legacy `application/csp-report`
 * body or Reporting API batches (`application/reports+json`). Only a short
 * summary is logged: the directive, the blocked origin and the page path,
 * never query strings.
 */

/** Largest body read; a real report is a few hundred bytes. */
export const MAX_BODY_BYTES = 16 * 1024;
/** Most reports logged from one batch. */
export const MAX_REPORTS = 10;

export type Violation = {
  directive: string;
  blocked: string;
  page: string;
};

const asString = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 200) : "";

/** Control characters (newlines included) and Unicode line separators. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** A value with every character that could break a log line removed. */
export function sanitizeForLog(value: string) {
  return value.replace(CONTROL_CHARS, "");
}

/** A CSP directive name such as "script-src-elem", or "unknown". */
export function directiveOf(value: string) {
  return /^[a-z][a-z-]{0,39}$/.test(value) ? value : "unknown";
}

/** Origin (or keyword such as "inline") without the path or query. */
export function originOf(value: string) {
  if (!value) return "unknown";
  try {
    const url = new URL(value);
    return sanitizeForLog(
      url.origin === "null" ? url.protocol.replace(/:$/, "") : url.origin,
    );
  } catch {
    // Keywords browsers send instead of a URL: "inline", "eval", "self", ...
    return /^[a-z][a-z-]{0,39}$/i.test(value) ? value : "invalid";
  }
}

/** Path of the page, without its query string or fragment. */
export function pathOf(value: string) {
  if (!value) return "unknown";
  try {
    return sanitizeForLog(new URL(value).pathname).slice(0, 120);
  } catch {
    return "unknown";
  }
}

/** The violations in a legacy report or a Reporting API batch. */
export function violationsFrom(body: unknown): Violation[] {
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const entry of body) {
      const report = (entry as { type?: unknown; body?: unknown } | null) ?? {};
      if (report.type === "csp-violation" && report.body) {
        items.push(report.body as Record<string, unknown>);
      }
    }
  } else if (body && typeof body === "object" && "csp-report" in body) {
    const legacy = (body as Record<string, unknown>)["csp-report"];
    if (legacy && typeof legacy === "object") {
      items.push(legacy as Record<string, unknown>);
    }
  }
  return items.slice(0, MAX_REPORTS).map((r) => ({
    directive: directiveOf(
      asString(r.effectiveDirective) ||
        asString(r["effective-directive"]) ||
        asString(r["violated-directive"]),
    ),
    blocked: originOf(asString(r.blockedURL) || asString(r["blocked-uri"])),
    page: pathOf(asString(r.documentURL) || asString(r["document-uri"])),
  }));
}

/**
 * The body as text, reading no more than `maxBytes` however it's sent
 * (Content-Length or chunked), or null when it's larger.
 */
export async function readCappedText(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The caller's IP for rate limiting: the first `X-Forwarded-For` hop (set by
 * Vercel's edge), then `X-Real-IP`, else "unknown" so callers without either
 * share one bucket.
 */
export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : "unknown";
}

/** Reports logged per IP per window; the rest are dropped. */
export const REPORTS_PER_WINDOW = 30;
export const REPORT_WINDOW_MS = 60_000;
/** Most IPs tracked at once, so a spray of addresses can't grow memory. */
const MAX_TRACKED_IPS = 1000;

/**
 * A fixed-window counter per IP, kept in memory. It's per server instance,
 * so it's a log-flood guard, not a hard limit: these reports cost nothing
 * but log lines, and keeping them out of Postgres keeps the endpoint free.
 */
export function createReportLimiter({
  limit = REPORTS_PER_WINDOW,
  windowMs = REPORT_WINDOW_MS,
  maxTracked = MAX_TRACKED_IPS,
} = {}) {
  const windows = new Map<string, { start: number; count: number }>();
  return (ip: string, now = Date.now()) => {
    let entry = windows.get(ip);
    if (!entry || now - entry.start >= windowMs) {
      if (!entry && windows.size >= maxTracked) {
        for (const [key, value] of windows) {
          if (now - value.start >= windowMs) windows.delete(key);
        }
        // Still full of live windows: refuse rather than grow.
        if (windows.size >= maxTracked) return false;
      }
      entry = { start: now, count: 0 };
      windows.set(ip, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
