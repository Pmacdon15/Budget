import "server-only";
import { del, get, list, put } from "@vercel/blob";
import { IMAGE_CONTENT_TYPE } from "@/lib/receipt-image";

/**
 * Receipt photos in the project's private Vercel Blob store
 * (BLOB_READ_WRITE_TOKEN, set when the store is connected in Vercel).
 * Private means nothing is reachable by URL: every read goes through the app,
 * which checks the photo belongs to the signed-in user first.
 */

export async function putReceiptImage(pathname: string, image: Blob) {
  await put(pathname, image, {
    access: "private",
    contentType: IMAGE_CONTENT_TYPE,
  });
}

/**
 * A receipt file (an email's PDF attachment, or the email itself as HTML),
 * private like the photos and served the same way.
 */
export async function putReceiptFile(
  pathname: string,
  file: Blob,
  contentType: string,
) {
  await put(pathname, file, { access: "private", contentType });
}

/** The photo's bytes, or null when it is gone. */
export async function readReceiptImage(
  pathname: string,
): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private" });
  if (result?.statusCode !== 200) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

/**
 * Best effort: a photo (or receipt file) left behind costs a few hundred KB,
 * not correctness, and the daily cleanup removes it later.
 */
export async function deleteReceiptImage(pathname: string) {
  try {
    await del(pathname);
  } catch (error) {
    console.error("deleting a receipt photo failed", error);
  }
}

export type StoredReceiptImage = { pathname: string; uploadedAt: Date };

/** One page (up to 1,000) of every user's receipt photos, for the cleanup job. */
export async function listReceiptImages(cursor?: string): Promise<{
  images: StoredReceiptImage[];
  cursor?: string;
}> {
  const page = await list({ prefix: "receipts/", cursor, limit: 1000 });
  return {
    images: page.blobs.map(({ pathname, uploadedAt }) => ({
      pathname,
      uploadedAt: new Date(uploadedAt),
    })),
    cursor: page.hasMore ? page.cursor : undefined,
  };
}

/** Removes several photos in one request. Throws so the cleanup job can report it. */
export async function deleteReceiptImages(pathnames: string[]) {
  if (pathnames.length > 0) await del(pathnames);
}
