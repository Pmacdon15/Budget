import "server-only";
import { createHash } from "node:crypto";
import { claimReceiptScan } from "@/dal/receipt-scans";
import {
  countExpensesSharingReceipt,
  selectExpenseById,
  setExpenseReceipt,
} from "@/db/expenses";
import { emailDocument, emailHtmlToText } from "@/lib/email-html";
import type { ReceiptDetails } from "@/lib/pending-expenses";
import {
  type ReadableReceipt,
  readReceiptSafely,
  type ScanResult,
} from "@/lib/receipt-ai";
import {
  EMAIL_CONTENT_TYPE,
  FILE_CONTENT_TYPE,
  MAX_EMAIL_HTML_CHARS,
  newReceiptFilePathname,
  PDF_CONTENT_TYPE,
} from "@/lib/receipt-files";
import {
  IMAGE_CONTENT_TYPE,
  newReceiptImagePathname,
} from "@/lib/receipt-image";
import {
  deleteReceiptImage,
  putReceiptFile,
  putReceiptImage,
} from "@/lib/receipt-store";
import {
  classifyUpload,
  isReadableText,
  type UploadResponse,
  uploadName,
} from "@/lib/receipt-upload";

/*
 * A file the user uploads in Budget as one of their expenses' receipt: a PDF,
 * a photo, an email (HTML) or any other file. It replaces the receipt the
 * expense had (on every part of a split). PDFs, photos and text are read
 * with AI, counted against the same scan limit as photo scans, so the user
 * can confirm the amount. Called by the upload route with the Clerk user id
 * it already checked.
 */

/** Why an upload was refused, with the HTTP status the route answers. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type Upload = { bytes: Uint8Array; name: string; type: string };

/** Removes copies that were stored but not kept, or were replaced. */
const discardReceiptFiles = (pathnames: (string | null | undefined)[]) =>
  Promise.all(
    pathnames
      .filter((p): p is string => Boolean(p))
      .map((p) => deleteReceiptImage(p)),
  );

const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

/** What the reader is given, or null when the file can't be read. */
function readableOf(
  kind: ReturnType<typeof classifyUpload>,
  upload: Upload,
  html: string | null,
): ReadableReceipt | null {
  if (kind === "photo") return { kind: "jpeg", bytes: upload.bytes };
  if (kind === "pdf") return { kind: "pdf", bytes: upload.bytes };
  if (kind === "email" && html)
    return { kind: "text", text: emailHtmlToText(html) };
  if (kind === "file" && isReadableText(upload.name, upload.type)) {
    return { kind: "text", text: new TextDecoder().decode(upload.bytes) };
  }
  return null;
}

export async function uploadExpenseReceipt(
  userId: string,
  expenseId: string,
  upload: Upload,
): Promise<UploadResponse> {
  // The expense first, so a wrong id stores and reads nothing.
  const expense = await selectExpenseById(userId, expenseId);
  if (!expense) throw new UploadError("That expense wasn't found.", 404);

  const kind = classifyUpload(upload.bytes, upload.name, upload.type);
  const name = uploadName(upload.name);
  let html: string | null = null;
  if (kind === "email") {
    html = new TextDecoder().decode(upload.bytes);
    if (html.length > MAX_EMAIL_HTML_CHARS) {
      throw new UploadError("That email is too large to save.", 413);
    }
  }

  const readable = readableOf(kind, upload, html);
  let reading: ScanResult | null = null;
  let limited: string | undefined;
  if (readable) {
    const claim = await claimReceiptScan(userId);
    if (claim.allowed) reading = await readReceiptSafely(readable);
    else limited = claim.message;
  }
  const fields = reading?.fields ?? {};

  const details: ReceiptDetails = {
    merchant: fields.merchant ?? null,
    purchasedOn: fields.purchasedOn ?? null,
    subtotalCents: fields.subtotalCents ?? null,
    taxCents: fields.taxCents ?? null,
    totalCents: fields.totalCents ?? null,
    rawText: fields.rawText ?? null,
    imagePathname: null,
    filePathname: null,
    fileKind: null,
    fileName: name,
    fileBytes: upload.bytes.length,
    currency: fields.currency ?? null,
    contentHash: sha256(upload.bytes),
  };

  if (kind === "photo") {
    details.imagePathname = newReceiptImagePathname(userId);
    await putReceiptImage(
      details.imagePathname,
      new Blob([new Uint8Array(upload.bytes)], { type: IMAGE_CONTENT_TYPE }),
    );
  } else {
    const fileKind =
      kind === "pdf" ? "pdf" : kind === "email" ? "email" : "file";
    const contentType =
      fileKind === "pdf"
        ? PDF_CONTENT_TYPE
        : fileKind === "email"
          ? EMAIL_CONTENT_TYPE
          : FILE_CONTENT_TYPE;
    const body =
      fileKind === "email"
        ? emailDocument({
            subject: name?.replace(/\.html?$/i, "") ?? null,
            from: null,
            date: null,
            html,
            text: null,
          })
        : new Uint8Array(upload.bytes);
    details.fileKind = fileKind;
    details.filePathname = newReceiptFilePathname(userId, fileKind);
    if (fileKind === "email") {
      details.emailSubject = name?.replace(/\.html?$/i, "") ?? null;
      details.fileBytes = Buffer.byteLength(body as string, "utf8");
    }
    await putReceiptFile(
      details.filePathname,
      new Blob([body], { type: contentType }),
      contentType,
    );
  }

  const saved = await setExpenseReceipt(userId, expenseId, details);
  if (!saved) {
    await discardReceiptFiles([details.imagePathname, details.filePathname]);
    throw new UploadError("That expense wasn't found.", 404);
  }
  await discardReceiptFiles(saved.replacedFiles);

  return {
    kind: kind === "photo" ? "photo" : (details.fileKind ?? "file"),
    reading: {
      recognised: reading?.recognised ?? false,
      fields,
      ...(reading?.unavailable ? { unavailable: true } : {}),
      ...(limited ? { limited } : {}),
      ...(readable ? {} : { unreadable: true }),
    },
    expense: {
      id: expense.id,
      amountCents: expense.amountCents,
      parts: Math.max(1, await countExpensesSharingReceipt(userId, expenseId)),
    },
  };
}
