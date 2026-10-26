/**
 * Serves one receipt's saved copy: its photo or the PDF from the email. A
 * saved email redirects to `/email`, which is sandboxed. Add `?download=1`
 * to download it. Only the signed-in owner can read it; anyone else gets a
 * 404.
 */

import { getReceiptFile } from "@/dal/receipt-files";
import { receiptFileResponse } from "@/lib/receipt-file-response";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return receiptFileResponse(request, (await ctx.params).id, getReceiptFile);
}
