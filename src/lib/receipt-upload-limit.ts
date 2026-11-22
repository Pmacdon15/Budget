/**
 * How much a user may put in the private Blob store each day: receipt photos,
 * receipt files (PDFs, emails, any upload) and statement PDFs, from the app
 * and from AI apps alike. Sign-up is open and every copy is up to 3MB, so
 * without a cap one account (or a leaked API key) could grow the store
 * without end. Pure helpers; the counting itself is in
 * `@/db/receipt-upload-limits`.
 */

import { scanWindows } from "@/lib/receipt-scan-limit";

export const DEFAULT_UPLOADS_PER_DAY = 200;
export const DEFAULT_UPLOAD_BYTES_PER_DAY = 200 * 1024 * 1024;

export type UploadLimits = { perDay: number; bytesPerDay: number };
/** Which daily budget ran out: the number of files or their total size. */
export type UploadLimitReason = "count" | "bytes";

type Env = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value?.trim() && Number.isSafeInteger(n) && n > 0 ? n : fallback;
};

/** `RECEIPT_UPLOADS_PER_DAY` / `RECEIPT_UPLOAD_BYTES_PER_DAY`, or the defaults. */
export function uploadLimits(env: Env = process.env): UploadLimits {
  return {
    perDay: positiveInt(env.RECEIPT_UPLOADS_PER_DAY, DEFAULT_UPLOADS_PER_DAY),
    bytesPerDay: positiveInt(
      env.RECEIPT_UPLOAD_BYTES_PER_DAY,
      DEFAULT_UPLOAD_BYTES_PER_DAY,
    ),
  };
}

/** Start of the UTC day `now` falls in: the window uploads are counted in. */
export function uploadWindowStart(now: Date) {
  return scanWindows(now).day.start;
}

/** Whole seconds until the UTC day ends and the budget resets, at least 1. */
export function uploadRetryAfterSeconds(now: Date) {
  const end = scanWindows(now).day.end.getTime();
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

/** The tool error an AI app gets when a copy it sent is refused. */
export function uploadLimitToolMessage(retryAfterSeconds: number) {
  const hours = Math.max(1, Math.ceil(retryAfterSeconds / 3600));
  return `Nothing was saved: the user has reached today's limit for saving receipts and files in Budget. It resets at midnight UTC, in about ${hours} hour${hours === 1 ? "" : "s"}. Tell the user, and try again then.`;
}

export function uploadLimitMessage(reason: UploadLimitReason) {
  return reason === "count"
    ? "You've saved a lot of receipts and files today. Try again tomorrow."
    : "You've reached today's limit for saving receipts and files. Try again tomorrow.";
}
