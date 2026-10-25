import { UnauthorizedError } from "@/dal/errors";
import { getReceiptPhotoManifest } from "@/dal/receipt-photos";
import {
  type ReceiptPhotoError,
  receiptPhotosSchema,
  tooManyPhotosMessage,
} from "@/lib/receipt-photos";

/**
 * Lists the receipt photos for a .zip download, as JSON:
 *
 *     /api/receipts/photos?from=2026-01&to=2026-10&category=Groceries&category=Dining
 *
 * Same month range and category boxes as the expense download. The browser
 * fetches each listed photo through the owner-checked image route and zips
 * them itself. Errors come back as JSON too, so a failure is a message, never
 * a file the browser saves. Blob pathnames are never sent.
 */

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
};

const fail = (status: number, error: string) =>
  Response.json({ error } satisfies ReceiptPhotoError, { status, headers });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = receiptPhotosSchema.safeParse({
    from: params.get("from"),
    to: params.get("to"),
    categories: params.getAll("category"),
  });
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "Invalid download");
  }

  let result: Awaited<ReturnType<typeof getReceiptPhotoManifest>>;
  try {
    result = await getReceiptPhotoManifest(parsed.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) return fail(401, error.message);
    console.error("listing receipt photos failed", error);
    return fail(500, "Couldn't list the receipt photos. Try again.");
  }
  if (result.tooMany) return fail(413, tooManyPhotosMessage());

  return Response.json(result.manifest, { headers });
}
