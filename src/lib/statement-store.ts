import "server-only";
import { del, put } from "@vercel/blob";
import { PDF_CONTENT_TYPE } from "@/lib/statement-pdf";

/**
 * Statement PDFs in the project's private Vercel Blob store, kept like
 * receipt photos: nothing is reachable by URL, and every download goes
 * through the app, which checks the statement belongs to the signed-in user.
 */

export async function putStatementPdf(pathname: string, pdf: Blob) {
  await put(pathname, pdf, {
    access: "private",
    contentType: PDF_CONTENT_TYPE,
  });
}

/** Best effort: a PDF left behind costs storage, not correctness. */
export async function deleteStatementPdf(pathname: string) {
  try {
    await del(pathname);
  } catch (error) {
    console.error("deleting a statement PDF failed", error);
  }
}
