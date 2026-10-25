import "server-only";
import { countScan, selectScanCounts } from "@/db/receipt-scans";
import {
  retryAfterSeconds,
  type ScanPeriod,
  scanLimitMessage,
  scanLimits,
} from "@/lib/receipt-scan-limit";

export type ScanClaim =
  | { allowed: true }
  | {
      allowed: false;
      period: ScanPeriod;
      message: string;
      retryAfterSeconds: number;
    };

/**
 * Uses up one of `userId`'s receipt scans, or says why not. The route calls
 * this with the Clerk user id it already checked, before storing the photo or
 * calling the AI, so a refused scan costs nothing.
 */
export async function claimReceiptScan(
  userId: string,
  now = new Date(),
): Promise<ScanClaim> {
  const limits = scanLimits();
  if (await countScan(userId, now, limits)) return { allowed: true };

  const counts = await selectScanCounts(userId, now);
  const period: ScanPeriod = counts.day >= limits.perDay ? "day" : "hour";
  return {
    allowed: false,
    period,
    message: scanLimitMessage(period),
    retryAfterSeconds: retryAfterSeconds(now, period),
  };
}
