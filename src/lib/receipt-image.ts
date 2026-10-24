/**
 * Receipt photo pathnames in the private Vercel Blob store:
 *
 *     receipts/<userId>/<uuid>.jpg
 *
 * The upload route hands the pathname back to the browser, and the browser
 * posts it again with the expense form, so by the time it reaches the save
 * action it is user input. `isOwnReceiptImagePathname` is what stops one user
 * attaching another user's photo: only a pathname inside the caller's own
 * folder, with exactly the filename shape minted here, is accepted.
 */

const ROOT = "receipts";

/** Clerk ids are `user_` plus letters and digits; anything else could move the folder boundary. */
const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Exactly what `newReceiptImagePathname` emits, which rules out `../` and extra segments. */
const SAFE_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

/** A compressed receipt photo; a Vercel function accepts about 4.5MB, so this leaves headroom. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export const IMAGE_CONTENT_TYPE = "image/jpeg";

export function newReceiptImagePathname(userId: string): string {
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("Cannot build a photo pathname for this user id.");
  }
  return `${ROOT}/${userId}/${crypto.randomUUID()}.jpg`;
}

export function isOwnReceiptImagePathname(
  value: unknown,
  userId: string,
): value is string {
  if (typeof value !== "string" || !SAFE_USER_ID.test(userId)) return false;
  const prefix = `${ROOT}/${userId}/`;
  return (
    value.startsWith(prefix) && SAFE_FILENAME.test(value.slice(prefix.length))
  );
}
