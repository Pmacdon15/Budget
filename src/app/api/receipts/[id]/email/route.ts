/**
 * Serves a receipt that is a saved email (sanitized HTML), sandboxed by the
 * Content Security Policy next.config.ts sets for this path. Add
 * `?download=1` to download it. Only the signed-in owner can read it; anyone
 * else gets a 404. A photo or PDF redirects to `/file`.
 */

import { getReceiptFile } from "@/dal/receipt-files";
import { receiptFileResponse } from "@/lib/receipt-file-response";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return receiptFileResponse(
    request,
    (await ctx.params).id,
    getReceiptFile,
    "email",
  );
}
