import { UnauthorizedError } from "@/dal/errors";
import { getPlannedExpenditures } from "@/dal/receipt-export";
import { buildExpenditureSummary } from "@/lib/exports/expenditures";
import {
  type ReceiptExportError,
  receiptExportSummarySchema,
} from "@/lib/receipt-export";
import { contentDisposition } from "@/lib/receipt-file-response";

/**
 * One summary of every expenditure in a period, for the top of the receipts
 * .zip:
 *
 *     /api/receipts/export/summary?from=2026-01-01&to=2026-03-31&format=xlsx
 *
 * CSV, Excel or PDF. Each row names its receipt's file in the zip. Only the
 * signed-in user's spending is read; errors are JSON, never a file.
 */

const fail = (status: number, error: string) =>
  Response.json({ error } satisfies ReceiptExportError, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = receiptExportSummarySchema.safeParse({
    from: params.get("from"),
    to: params.get("to"),
    format: params.get("format"),
  });
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "Invalid download");
  }

  let rows: Awaited<ReturnType<typeof getPlannedExpenditures>>;
  try {
    rows = await getPlannedExpenditures(parsed.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) return fail(401, error.message);
    console.error("reading expenditures for a summary failed", error);
    return fail(500, "Couldn't build the summary. Try again.");
  }

  const file = await buildExpenditureSummary(
    rows,
    parsed.data,
    parsed.data.format,
  );
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": contentDisposition("attachment", file.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
