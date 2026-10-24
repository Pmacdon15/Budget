import "server-only";
import { del, get, put } from "@vercel/blob";
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

/** The photo's bytes, or null when it is gone. */
export async function readReceiptImage(
  pathname: string,
): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private" });
  if (result?.statusCode !== 200) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

/** Best effort: a photo left behind costs a few hundred KB, not correctness. */
export async function deleteReceiptImage(pathname: string) {
  try {
    await del(pathname);
  } catch (error) {
    console.error("deleting a receipt photo failed", error);
  }
}
