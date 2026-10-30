import { UnauthorizedError } from "@/dal/errors";
import { getReceiptExportManifest } from "@/dal/receipt-export";
import {
  type ReceiptExportError,
  receiptExportSchema,
  tooManyReceiptsMessage,
} from "@/lib/receipt-export";

/**
 * Lists what goes in the receipts .zip for a period, as JSON:
 *
 *     /api/receipts/export?from=2026-01-01&to=2026-03-31&format=csv&format=xlsx&format=pdf
 *
 * `format` repeats once per summary to put at the top of the zip (none is
 * fine: receipts only). The browser then fetches each summary and receipt
 * copy through its owner-checked route and zips them itself. Errors come
 * back as JSON too, so a failure is a message, never a file the browser
 * saves. Blob pathnames are never sent.
 */

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
};

const fail = (status: number, error: string) =>
  Response.json({ error } satisfies ReceiptExportError, { status, headers });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = receiptExportSchema.safeParse({
    from: params.get("from"),
    to: params.get("to"),
    formats: params.getAll("format"),
  });
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "Invalid download");
  }

  let result: Awaited<ReturnType<typeof getReceiptExportManifest>>;
  try {
    result = await getReceiptExportManifest(parsed.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) return fail(401, error.message);
    console.error("listing receipts for a download failed", error);
    return fail(500, "Couldn't list the receipts. Try again.");
  }
  if (result.tooMany) return fail(413, tooManyReceiptsMessage());

  return Response.json(result.manifest, { headers });
}
