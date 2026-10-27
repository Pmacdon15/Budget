import "server-only";
import { isPdf } from "@/lib/receipt-files";
import { isJpeg } from "@/lib/receipt-image";

/*
 * Turning a file an AI sent as base64 (a receipt's PDF or JPEG) into its
 * bytes, and checking stored bytes before they are served. AI apps and email
 * tools hand over base64 in several shapes, all of which should work:
 *
 * - plain base64, or base64url (what the Gmail API returns for attachments)
 * - with line breaks (MIME wraps base64 at 76 characters)
 * - as a data URL (`data:application/pdf;base64,JVBERi0...`)
 * - encoded twice (the base64 text itself base64-encoded)
 */

/** What a file is: decides which signature to look for. */
export type FileSignature = "pdf" | "jpeg";

const DATA_URL_PREFIX = /^data:[^,]{0,200}?;base64,/i;

/**
 * A PDF's header may follow a few stray bytes (a byte order mark, blank
 * lines): readers look for `%PDF-` in the first 1024 bytes.
 */
const PDF_HEADER_WINDOW = 1024;

/** Whether `bytes` is a PDF: `%PDF-` at the start or within its first 1024 bytes. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (isPdf(bytes)) return true;
  const window = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    Math.min(bytes.length, PDF_HEADER_WINDOW),
  );
  return window.includes("%PDF-");
}

const matches = (bytes: Uint8Array, kind: FileSignature) =>
  kind === "pdf" ? looksLikePdf(bytes) : isJpeg(bytes);

/** Base64 or base64url text, minus a data URL prefix and whitespace. */
function cleanBase64(value: string): string {
  return value.trim().replace(DATA_URL_PREFIX, "").replace(/\s+/g, "");
}

const BASE64_TEXT = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Bytes that are themselves base64 text of a `kind` file (a double-encoded
 * upload, or a copy stored that way), decoded; otherwise null.
 */
function decodeNested(bytes: Uint8Array, kind: FileSignature) {
  // Only plain ASCII can be base64 text; a real PDF or JPEG never is.
  const text = cleanBase64(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString(
      "latin1",
    ),
  );
  if (text.length < 8 || !BASE64_TEXT.test(text)) return null;
  const inner = new Uint8Array(Buffer.from(text, "base64"));
  return matches(inner, kind) ? inner : null;
}

/**
 * The file in `base64` (any of the shapes above), or null when it isn't a
 * `kind` file at all.
 */
export function decodeBase64File(
  base64: string,
  kind: FileSignature,
): Uint8Array | null {
  const bytes = new Uint8Array(Buffer.from(cleanBase64(base64), "base64"));
  if (matches(bytes, kind)) return bytes;
  return decodeNested(bytes, kind);
}

/**
 * Stored receipt bytes ready to serve as `kind`: as they are when they are
 * that file, decoded when they were saved still base64-encoded, or null when
 * they are something else (empty, or another kind of file).
 */
export function servableBytes(
  bytes: Uint8Array,
  kind: FileSignature,
): Uint8Array | null {
  if (bytes.length === 0) return null;
  if (matches(bytes, kind)) return bytes;
  return decodeNested(bytes, kind);
}
