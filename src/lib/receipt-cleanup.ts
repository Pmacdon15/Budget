import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Rules for the daily job that removes receipt photos nothing uses: scans that
 * were never saved with an expense (the form was closed, or the route was
 * scripted). A photo is only removed once it is old enough that no open form
 * could still save it.
 */

/** A scan that hasn't been saved within a day is treated as abandoned. */
export const UNATTACHED_PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Blob list pages per run (1,000 photos each), so one run stays well inside a function's time limit. */
export const MAX_CLEANUP_PAGES = 20;

export function isOldEnoughToRemove(uploadedAt: Date, now: Date): boolean {
  return now.getTime() - uploadedAt.getTime() >= UNATTACHED_PHOTO_MAX_AGE_MS;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether a request carries Vercel Cron's `Authorization: Bearer <CRON_SECRET>`.
 * Fails closed: with no secret configured, nothing is authorized. Compares
 * digests in constant time so the secret can't be guessed byte by byte.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
