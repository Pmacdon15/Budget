import "server-only";
import { UnauthorizedError } from "@/dal/errors";
import type { StoredReceiptFile } from "@/db/receipt-files";
import { EMAIL_CONTENT_SECURITY_POLICY } from "@/lib/email-html";
import { servableBytes } from "@/lib/receipt-bytes";
import {
  downloadFilename,
  EMAIL_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
} from "@/lib/receipt-files";
import { IMAGE_CONTENT_TYPE } from "@/lib/receipt-image";
import { readReceiptFile } from "@/lib/receipt-store";
import { idSchema } from "@/lib/schemas";

/*
 * Serves a receipt's saved copy (photo, PDF or email) from the private blob
 * store, for the receipt and pending-receipt routes. Authorization keys off
 * an id the DAL looks up for the signed-in user, never a pathname from the
 * client. `?download=1` asks the browser to save it instead of showing it.
 *
 * A saved email is only ever served from its own `/email` route, never from
 * `/file`: that path gets the sandboxing Content Security Policy from
 * `next.config.ts` (see src/lib/security-headers.ts), since a header set in
 * next.config wins over the same header set by a route.
 */

/** Which route is serving: `/file` (photo or PDF) or `/email`. */
export type ReceiptRoute = "file" | "email";

/** One answer for every refusal, so a probe can't tell the cases apart. */
const notFound = () => new Response("Not found", { status: 404 });

const CONTENT_TYPES: Record<StoredReceiptFile["kind"], string> = {
  photo: IMAGE_CONTENT_TYPE,
  pdf: PDF_CONTENT_TYPE,
  email: EMAIL_CONTENT_TYPE,
};

/** `attachment` or `inline`, with an ASCII filename and its UTF-8 twin. */
export function contentDisposition(
  type: "attachment" | "inline",
  filename: string,
) {
  return `${type}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function receiptFileResponse(
  request: Request,
  rawId: string,
  lookup: (id: string) => Promise<StoredReceiptFile | null>,
  route: ReceiptRoute = "file",
): Promise<Response> {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return notFound();

  let file: StoredReceiptFile | null;
  try {
    file = await lookup(parsed.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw error;
  }
  if (!file) return notFound();
  if ((file.kind === "email") !== (route === "email")) {
    // The other route serves it; send the browser there.
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(
      /\/(file|email)$/,
      file.kind === "email" ? "/email" : "/file",
    );
    return Response.redirect(url, 307);
  }

  let stored: Uint8Array | null;
  try {
    stored = await readReceiptFile(file.pathname);
  } catch (error) {
    console.error("reading a receipt file failed", error);
    return new Response("Bad gateway", { status: 502 });
  }
  const bytes = stored ? bytesToServe(file.kind, stored) : null;
  if (!bytes) {
    if (stored) {
      console.error("a stored receipt file is empty or not what it says", {
        kind: file.kind,
        bytes: stored.length,
      });
    }
    return notFound();
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = downloadFilename(file.kind, file.name);
  const headers: Record<string, string> = {
    // The type this app stored, never one sniffed or sent by someone else.
    "Content-Type": CONTENT_TYPES[file.kind],
    // The length of the bytes sent, never a length the store reported.
    "Content-Length": String(bytes.length),
    "Content-Disposition": contentDisposition(
      download ? "attachment" : "inline",
      filename,
    ),
    // Private bytes: nothing in between may keep a copy.
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (file.kind === "email") {
    // The sender wrote this HTML: no scripts, no origin, no network.
    headers["Content-Security-Policy"] = EMAIL_CONTENT_SECURITY_POLICY;
  }
  return new Response(new Uint8Array(bytes), { headers });
}

/**
 * The bytes to send for a stored copy, or null when there is nothing usable:
 * an empty file, or a "PDF" that isn't one. A PDF or photo saved still
 * base64-encoded is decoded, so it opens without being saved again.
 */
function bytesToServe(
  kind: StoredReceiptFile["kind"],
  stored: Uint8Array,
): Uint8Array | null {
  if (stored.length === 0) return null;
  if (kind === "pdf") return servableBytes(stored, "pdf");
  // A photo (always re-encoded as a JPEG by the app) or an email (stored as
  // sanitized HTML) is served as stored; a photo saved still base64-encoded
  // is decoded first.
  return kind === "photo" ? (servableBytes(stored, "jpeg") ?? stored) : stored;
}
