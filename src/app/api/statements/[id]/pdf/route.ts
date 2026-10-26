/**
 * Downloads one statement's PDF from the private blob store, like a receipt
 * photo.
 *
 * Authorization keys off the statement id, never a pathname from the client:
 * the DAL looks the id up scoped to the signed-in user, so someone else's
 * statement reads as missing, and the pathname is whatever that row holds.
 */

import { get } from "@vercel/blob";
import { getStatementPdfPathname } from "@/dal/accounts";
import { UnauthorizedError } from "@/dal/errors";
import { idSchema } from "@/lib/schemas";

/** One answer for every refusal, so a probe can't tell the cases apart. */
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return notFound();

  let pathname: string | null;
  try {
    pathname = await getStatementPdfPathname(parsed.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw error;
  }
  if (!pathname) return notFound();

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: "private" });
  } catch (error) {
    console.error("reading a statement PDF failed", error);
    return new Response("Bad gateway", { status: 502 });
  }
  if (result?.statusCode !== 200) return notFound();

  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(result.blob.size),
      "Content-Disposition": `attachment; filename="statement-${parsed.data}.pdf"`,
      // Private bytes: nothing in between may keep a copy.
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
