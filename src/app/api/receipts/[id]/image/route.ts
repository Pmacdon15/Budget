/**
 * Serves one receipt's photo from the private blob store.
 *
 * Authorization keys off the receipt id, never a pathname from the client: the
 * DAL looks the id up scoped to the signed-in user, so someone else's receipt
 * reads as missing, and the pathname is whatever that row holds.
 */

import { UnauthorizedError } from "@/dal/errors";
import { getReceiptImagePathname } from "@/dal/expenses";
import { IMAGE_CONTENT_TYPE } from "@/lib/receipt-image";
import { readReceiptFile } from "@/lib/receipt-store";
import { idSchema } from "@/lib/schemas";

/** One answer for every refusal, so a probe can't tell the cases apart. */
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return notFound();

  let pathname: string | null;
  try {
    pathname = await getReceiptImagePathname(parsed.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw error;
  }
  if (!pathname) return notFound();

  let bytes: Uint8Array | null;
  try {
    bytes = await readReceiptFile(pathname);
  } catch (error) {
    console.error("reading a receipt photo failed", error);
    return new Response("Bad gateway", { status: 502 });
  }
  if (!bytes || bytes.length === 0) return notFound();

  return new Response(new Uint8Array(bytes), {
    headers: {
      // Photos are always stored as JPEGs. The length is that of the bytes
      // sent, never one the store reported (see readReceiptFile).
      "Content-Type": IMAGE_CONTENT_TYPE,
      "Content-Length": String(bytes.length),
      // Private bytes: nothing in between may keep a copy.
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
