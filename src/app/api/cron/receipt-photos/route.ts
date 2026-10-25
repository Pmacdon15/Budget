/**
 * Daily Vercel Cron job (see vercel.json): removes receipt photos that were
 * scanned but never saved with an expense, once they are a day old.
 *
 * Vercel calls this with `Authorization: Bearer <CRON_SECRET>`. The proxy
 * leaves `/api/cron/*` out of Clerk's sign-in check, so this secret is the
 * only thing that lets a request in; without it set, every call is refused.
 */

import { deleteUnattachedReceiptPhotos } from "@/dal/receipt-cleanup";
import { isAuthorizedCronRequest } from "@/lib/receipt-cleanup";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore },
    );
  }

  try {
    const result = await deleteUnattachedReceiptPhotos();
    return Response.json(result, { headers: noStore });
  } catch (cause) {
    console.error("cleaning up unattached receipt photos failed", cause);
    return Response.json(
      { error: "Cleanup failed" },
      { status: 500, headers: noStore },
    );
  }
}
