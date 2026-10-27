import { fileExtension, isPdf, type ReceiptKind } from "@/lib/receipt-files";
import { isJpeg } from "@/lib/receipt-image";
import type { ScannedFields } from "@/lib/types";

/*
 * A file the user uploads in Budget as an expense's receipt: what it is, and
 * what the upload route answers. Shared by browser and server, so no
 * Node-only imports.
 */

/** How an uploaded file is kept. */
export type UploadKind = "photo" | "pdf" | "email" | "file";

/** The longest original file name kept for downloads. */
export const MAX_UPLOAD_NAME = 200;

/** Extensions of plain-text files the reader can read (besides HTML emails). */
const TEXT_EXTENSIONS = new Set(["eml", "txt", "text", "csv", "md"]);

/**
 * What an uploaded file is, by its bytes first: a JPEG or PDF is whatever
 * it says inside, whatever it's called. An HTML file is an email to sanitize
 * and show. Anything else is kept as is and only offered as a download.
 */
export function classifyUpload(
  bytes: Uint8Array,
  name: string,
  type: string,
): UploadKind {
  if (isJpeg(bytes)) return "photo";
  if (isPdf(bytes)) return "pdf";
  const extension = fileExtension(name);
  if (
    extension === "html" ||
    extension === "htm" ||
    type.toLowerCase().startsWith("text/html")
  ) {
    return "email";
  }
  return "file";
}

/**
 * Whether a kept-as-is file is plain text the reader can still read: a saved
 * email (.eml), a .txt, and so on.
 */
export function isReadableText(name: string, type: string): boolean {
  const extension = fileExtension(name);
  const mime = type.toLowerCase();
  return (
    (extension !== null && TEXT_EXTENSIONS.has(extension)) ||
    mime === "message/rfc822" ||
    mime.startsWith("text/")
  );
}

/** The original name, trimmed to something safe to keep, or null. */
export function uploadName(name: string): string | null {
  const trimmed = name.replace(/[\r\n\0]+/g, " ").trim();
  return trimmed ? trimmed.slice(0, MAX_UPLOAD_NAME) : null;
}

/** What `POST /api/receipts/upload` answers when the file was saved. */
export type UploadResponse = {
  kind: Exclude<ReceiptKind, "details">;
  /** What was read off it. */
  reading: {
    recognised: boolean;
    fields: ScannedFields;
    /** The reader couldn't be reached. */
    unavailable?: boolean;
    /** The scan limit was reached, so it wasn't read. */
    limited?: string;
    /** This kind of file can't be read (a .docx, say). */
    unreadable?: boolean;
  };
  expense: {
    id: string;
    amountCents: number;
    /** How many expenses share this receipt: more than 1 for a split. */
    parts: number;
  };
};
