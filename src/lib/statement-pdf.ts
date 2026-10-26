/**
 * Statement PDF pathnames in the private Vercel Blob store:
 *
 *     statements/<userId>/<uuid>.pdf
 *
 * They live outside `receipts/`, so the daily receipt-photo cleanup and the
 * photo zip never touch them. A pathname is only ever minted here and read
 * back from the database, never taken from a client.
 */

const ROOT = "statements";

/** Clerk ids are `user_` plus letters and digits; anything else could move the folder boundary. */
const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A statement PDF, decoded. A Vercel function accepts about 4.5MB, so this leaves headroom. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** About 3MB once decoded. */
export const MAX_PDF_BASE64 = 4_200_000;

export const PDF_CONTENT_TYPE = "application/pdf";

/** A PDF starts with "%PDF-", whatever its name or stated type says. */
export const isPdf = (bytes: Uint8Array) =>
  bytes.length > 5 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46 &&
  bytes[4] === 0x2d;

export function newStatementPdfPathname(userId: string): string {
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("Cannot build a statement pathname for this user id.");
  }
  return `${ROOT}/${userId}/${crypto.randomUUID()}.pdf`;
}
