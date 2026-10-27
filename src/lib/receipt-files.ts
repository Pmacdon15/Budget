/**
 * Receipt files besides photos: the PDF attached to a bill or receipt email,
 * the email itself (as sanitized HTML) when it had no attachment, or any
 * other file the user uploaded (a .docx, a .eml, a PNG, ...), kept as opaque
 * bytes and only ever offered as a download. All sit in the private Vercel
 * Blob store next to photos:
 *
 *     receipts/<userId>/<uuid>.pdf
 *     receipts/<userId>/<uuid>.html
 *     receipts/<userId>/<uuid>.bin
 *
 * Nothing here is tied to expenses: the same receipt row (and these files)
 * can hang off an expense, a pending item, a fixed bill's payment, or later
 * an income entry. Shared by browser and server, so no Node-only imports.
 */

/** What a receipts row's `file_pathname` holds. */
export type ReceiptFileKind = "pdf" | "email" | "file";

/**
 * What a receipt can show: a photo, a PDF, the email, or only the details
 * read off it (amounts and text, nothing to open).
 */
export type ReceiptKind = "photo" | ReceiptFileKind | "details";

/** The same 3MB limit as a photo: a Vercel function accepts about 4.5MB in all. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** An email's HTML body, in characters. Bigger than any real receipt email. */
export const MAX_EMAIL_HTML_CHARS = 1_000_000;

/** An email's plain-text body, in characters. */
export const MAX_EMAIL_TEXT_CHARS = 200_000;

/** The most a file uploaded in Budget can be: the same 3MB as a PDF or photo. */
export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES;

export const PDF_CONTENT_TYPE = "application/pdf";
export const EMAIL_CONTENT_TYPE = "text/html; charset=utf-8";
/** Any other file: never shown in the browser, only downloaded. */
export const FILE_CONTENT_TYPE = "application/octet-stream";

const ROOT = "receipts";
const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SAFE_FILENAME = new RegExp(`^${UUID}\\.(pdf|html|bin)$`);

const EXTENSION: Record<ReceiptFileKind, string> = {
  pdf: "pdf",
  email: "html",
  file: "bin",
};

/** A PDF starts with `%PDF-`, whatever its name or stated type says. */
export const isPdf = (bytes: Uint8Array) =>
  bytes.length > 5 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46 &&
  bytes[4] === 0x2d;

export function newReceiptFilePathname(
  userId: string,
  kind: ReceiptFileKind,
): string {
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("Cannot build a receipt file pathname for this user id.");
  }
  return `${ROOT}/${userId}/${crypto.randomUUID()}.${EXTENSION[kind]}`;
}

/** Any user's receipt file pathname, exactly as `newReceiptFilePathname` mints it. */
export function isReceiptFilePathname(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const [root, userId, filename, ...rest] = value.split("/");
  return (
    root === ROOT &&
    rest.length === 0 &&
    SAFE_USER_ID.test(userId ?? "") &&
    SAFE_FILENAME.test(filename ?? "")
  );
}

export const isReceiptFileKind = (value: unknown): value is ReceiptFileKind =>
  value === "pdf" || value === "email" || value === "file";

/** What a stored receipt shows, from its columns. */
export function receiptKindOf(row: {
  fileKind?: unknown;
  imagePathname?: unknown;
}): ReceiptKind {
  if (isReceiptFileKind(row.fileKind)) return row.fileKind;
  return row.imagePathname ? "photo" : "details";
}

/** An email's Message-ID as one comparable string: no angle brackets, lower case. */
export function normalizeMessageId(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().replace(/^<+|>+$/g, "");
  return trimmed ? trimmed.toLowerCase() : null;
}

const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  photo: "receipt photo",
  pdf: "receipt PDF",
  email: "receipt email",
  file: "receipt file",
  details: "receipt details",
};

export const receiptKindLabel = (kind: ReceiptKind) =>
  RECEIPT_KIND_LABELS[kind];

/** A short, plain extension from a file name ("docx" from "Order.docx"), or null. */
export function fileExtension(name: string | null | undefined): string | null {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec((name ?? "").trim());
  return match?.[1] ? match[1].toLowerCase() : null;
}

/**
 * A safe download name: letters, digits, spaces, dots, dashes and
 * underscores, at most 80 characters, with the right extension. Any other
 * file keeps the extension it was uploaded with.
 */
export function downloadFilename(
  kind: Exclude<ReceiptKind, "details">,
  name: string | null | undefined,
): string {
  const extension =
    kind === "photo"
      ? "jpg"
      : kind === "file"
        ? (fileExtension(name) ?? EXTENSION.file)
        : EXTENSION[kind];
  const base = (name ?? "")
    .replace(
      kind === "file" ? /\.[A-Za-z0-9]{1,10}$/ : /\.(pdf|html?|jpe?g)$/i,
      "",
    )
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, 80)
    .trim();
  return `${base || "receipt"}.${extension}`;
}
