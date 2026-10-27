/**
 * Uploads a file as one of the signed-in user's expenses' receipt: a PDF
 * invoice, a photo, an email saved as HTML, or any other file (3MB at most).
 * It replaces the receipt the expense had. PDFs, photos and text are read
 * with AI, and the answer carries what was read so the form can offer the
 * amount for the user to confirm. Nothing about the expense itself changes
 * here.
 *
 * A Route Handler rather than a Server Action because a Server Action's body
 * is capped at 1MB, while a Vercel function takes about 4.5MB.
 *
 * Form fields: `expenseId` and `file`.
 */

import { auth } from "@clerk/nextjs/server";
import { UploadError, uploadExpenseReceipt } from "@/dal/receipt-uploads";
import { MAX_UPLOAD_BYTES } from "@/lib/receipt-files";
import { idSchema } from "@/lib/schemas";

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status });

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return error("Sign in to add a receipt.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Couldn't read the upload.", 400);
  }
  const expenseId = idSchema.safeParse(form.get("expenseId"));
  if (!expenseId.success) return error("That expense wasn't found.", 404);

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return error("Choose a file to upload.", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return error("That file is larger than 3MB.", 413);
  }

  try {
    const result = await uploadExpenseReceipt(userId, expenseId.data, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file instanceof File ? file.name : "",
      type: file.type,
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (cause) {
    if (cause instanceof UploadError) return error(cause.message, cause.status);
    console.error("uploading a receipt failed", cause);
    return error("That file couldn't be saved. Try again.", 502);
  }
}
