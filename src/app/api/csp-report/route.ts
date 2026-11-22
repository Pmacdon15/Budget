/*
 * Collects Content-Security-Policy-Report-Only violations (see
 * src/lib/security-headers.ts) and logs a one-line summary of each: the
 * directive, the blocked origin and the page path, never query strings.
 *
 * The endpoint is public (browsers send reports without cookies), so it reads
 * at most MAX_BODY_BYTES whatever the Content-Length says, strips anything
 * that could forge extra log lines, and drops reports past a per-IP limit.
 */

import {
  clientIp,
  createReportLimiter,
  MAX_BODY_BYTES,
  readCappedText,
  violationsFrom,
} from "@/lib/csp-report";

const allowReport = createReportLimiter();

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  // Over the limit: accept and drop, so a flood can't fill the logs.
  if (!allowReport(clientIp(req))) return new Response(null, { status: 204 });

  let body: unknown = null;
  try {
    const text = await readCappedText(req, MAX_BODY_BYTES);
    if (text === null) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  for (const v of violationsFrom(body)) {
    console.warn(
      `CSP report-only: ${v.directive} blocked ${v.blocked} on ${v.page}`,
    );
  }
  return new Response(null, { status: 204 });
}
