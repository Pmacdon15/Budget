/**
 * Receipt scan: stores the photo and reads it with AI in one request.
 *
 * A Route Handler rather than a Server Action because a Server Action's body
 * is capped at 1MB, while a Vercel function takes about 4.5MB, so the photo can
 * be posted as binary at a resolution the reader can actually use.
 *
 * Nothing is written to the database here. The response carries the photo's
 * pathname and the suggested fields; the expense form posts the pathname back
 * on save, where the DAL checks it is in the caller's own folder.
 */

import { auth } from "@clerk/nextjs/server";
import { readReceiptSafely } from "@/lib/receipt-ai";
import {
  IMAGE_CONTENT_TYPE,
  MAX_IMAGE_BYTES,
  newReceiptImagePathname,
} from "@/lib/receipt-image";
import { putReceiptImage } from "@/lib/receipt-store";

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status });

const isJpeg = (bytes: Uint8Array) =>
  bytes.length > 3 &&
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[2] === 0xff;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return error("Sign in to scan a receipt.", 401);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return error("Couldn't read the upload.", 400);
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return error("Choose a photo of the receipt.", 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return error("That photo is too large. Try a tighter crop.", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type !== IMAGE_CONTENT_TYPE || !isJpeg(bytes)) {
    return error("That file isn't a JPEG photo.", 415);
  }

  const pathname = newReceiptImagePathname(userId);
  // Storing and reading don't depend on each other, so they run side by side.
  const store = async () => {
    try {
      await putReceiptImage(
        pathname,
        new Blob([bytes], { type: IMAGE_CONTENT_TYPE }),
      );
      return true;
    } catch (cause) {
      console.error("storing the receipt photo failed", cause);
      return false;
    }
  };
  const [stored, scan] = await Promise.all([store(), readReceiptSafely(bytes)]);

  if (!stored) {
    return error("That photo couldn't be saved. Try again.", 502);
  }
  return Response.json(
    { image: pathname, ...scan },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
