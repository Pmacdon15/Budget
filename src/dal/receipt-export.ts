import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { selectExpenditures } from "@/db/receipt-export";
import {
  buildExportManifest,
  MAX_EXPORT_RECEIPTS,
  type PlannedExpenditure,
  planExpenditures,
  type ReceiptExportInput,
  type ReceiptExportManifest,
  type ReceiptExportRange,
} from "@/lib/receipt-export";

/*
 * For the receipts .zip routes. Each throws `UnauthorizedError` when signed
 * out, so the routes can answer with JSON instead of a redirect.
 */

/** The signed-in user's expenditures in the period, with their zip names. */
export async function getPlannedExpenditures(
  range: ReceiptExportRange,
): Promise<PlannedExpenditure[]> {
  const userId = await currentUserIdOrThrow();
  return planExpenditures(
    await selectExpenditures(userId, range.from, range.to),
  );
}

/** What goes in the zip, or `tooMany` when it has too many receipts. */
export async function getReceiptExportManifest(
  input: ReceiptExportInput,
): Promise<
  { tooMany: true } | { tooMany: false; manifest: ReceiptExportManifest }
> {
  const planned = await getPlannedExpenditures(input);
  const manifest = buildExportManifest(planned, input);
  if (manifest.receipts.length > MAX_EXPORT_RECEIPTS) return { tooMany: true };
  return { tooMany: false, manifest };
}
