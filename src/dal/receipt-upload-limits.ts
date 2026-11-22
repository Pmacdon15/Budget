import "server-only";
import { countUpload, selectUploadUsage } from "@/db/receipt-upload-limits";
import {
  type UploadLimitReason,
  uploadLimitMessage,
  uploadLimits,
  uploadRetryAfterSeconds,
} from "@/lib/receipt-upload-limit";

export type UploadClaim =
  | { allowed: true }
  | {
      allowed: false;
      reason: UploadLimitReason;
      message: string;
      retryAfterSeconds: number;
    };

/**
 * Uses up one of `userId`'s daily Blob uploads and `bytes` of the day's
 * storage budget, or says why not. Every path that stores a receipt photo,
 * receipt file or statement PDF calls this with the user id it already
 * checked, before it calls `put`, so a refused upload stores nothing.
 */
export async function claimBlobUpload(
  userId: string,
  bytes: number,
  now = new Date(),
): Promise<UploadClaim> {
  const limits = uploadLimits();
  if (await countUpload(userId, now, bytes, limits)) return { allowed: true };

  const usage = await selectUploadUsage(userId, now);
  const reason: UploadLimitReason =
    usage.count >= limits.perDay ? "count" : "bytes";
  return {
    allowed: false,
    reason,
    message: uploadLimitMessage(reason),
    retryAfterSeconds: uploadRetryAfterSeconds(now),
  };
}
