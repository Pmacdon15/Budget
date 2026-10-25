import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { selectReceiptPhotos } from "@/db/receipt-photos";
import {
  buildPhotoManifest,
  MAX_ZIP_PHOTOS,
  type ReceiptPhotoManifest,
  type ReceiptPhotosInput,
} from "@/lib/receipt-photos";

/**
 * For the photo-zip manifest route: the signed-in user's receipt photos
 * matching the filters, or `tooMany` past the limit. Throws
 * `UnauthorizedError` when signed out so the route can answer with JSON.
 */
export async function getReceiptPhotoManifest(
  filters: ReceiptPhotosInput,
): Promise<
  { tooMany: true } | { tooMany: false; manifest: ReceiptPhotoManifest }
> {
  const userId = await currentUserIdOrThrow();
  // One past the limit, to tell "exactly at the limit" from "over it".
  const rows = await selectReceiptPhotos(
    userId,
    filters.from,
    filters.to,
    filters.categories,
    MAX_ZIP_PHOTOS + 1,
  );
  if (rows.length > MAX_ZIP_PHOTOS) return { tooMany: true };
  return { tooMany: false, manifest: buildPhotoManifest(rows, filters) };
}
