import "server-only";
import { selectPhotosInUse } from "@/db/receipt-cleanup";
import { isOldEnoughToRemove, MAX_CLEANUP_PAGES } from "@/lib/receipt-cleanup";
import { isReceiptImagePathname } from "@/lib/receipt-image";
import { deleteReceiptImages, listReceiptImages } from "@/lib/receipt-store";
import { UNDO_WINDOW_MINUTES } from "@/lib/undo";

export type CleanupResult = {
  /** Photos looked at. */
  checked: number;
  /** Photos removed because nothing used them. */
  deleted: number;
  /** False when the run stopped at MAX_CLEANUP_PAGES; the next run carries on. */
  complete: boolean;
};

/**
 * Removes receipt photos, for every user, that are older than a day and that
 * no receipt (or fresh undo entry) uses. Not tied to a signed-in user: the
 * cron route authorizes the caller with CRON_SECRET before calling this.
 */
export async function deleteUnattachedReceiptPhotos(
  now = new Date(),
): Promise<CleanupResult> {
  const result: CleanupResult = { checked: 0, deleted: 0, complete: false };
  let cursor: string | undefined;

  for (let page = 0; page < MAX_CLEANUP_PAGES; page++) {
    const listed = await listReceiptImages(cursor);
    result.checked += listed.images.length;

    // Only photos this app minted, and only once no open form could save them.
    const candidates = listed.images
      .filter(
        (image) =>
          isReceiptImagePathname(image.pathname) &&
          isOldEnoughToRemove(image.uploadedAt, now),
      )
      .map((image) => image.pathname);
    const inUse = await selectPhotosInUse(candidates, UNDO_WINDOW_MINUTES);
    const unused = candidates.filter((pathname) => !inUse.has(pathname));

    await deleteReceiptImages(unused);
    result.deleted += unused.length;

    if (!listed.cursor) {
      result.complete = true;
      break;
    }
    cursor = listed.cursor;
  }
  return result;
}
