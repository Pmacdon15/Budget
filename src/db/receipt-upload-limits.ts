import "server-only";
import { db } from "@/db/client";
import {
  type UploadLimits,
  uploadWindowStart,
} from "@/lib/receipt-upload-limit";

/** Raw SQL for counting Blob uploads. Callers (the DAL) handle auth. */

/**
 * Counts one upload of `bytes` against `userId`'s day, in one statement,
 * unless the day already holds `limits.perDay` uploads or the bytes would
 * take it past `limits.bytesPerDay`. Returns whether the upload was counted.
 *
 * The upsert only adds when the stored row is under both limits, and Postgres
 * re-checks that against the latest row when two uploads race, so concurrent
 * requests can't push a day past its limits. Days older than yesterday are
 * pruned for this user on the way.
 */
export async function countUpload(
  userId: string,
  now: Date,
  bytes: number,
  limits: UploadLimits,
): Promise<boolean> {
  const dayStart = uploadWindowStart(now).toISOString();
  const rows = await db()`
    with pruned as (
      delete from receipt_upload_counts
      where user_id = ${userId}
        and window_start < ${dayStart}::timestamptz - interval '1 day'
    ),
    counted as (
      insert into receipt_upload_counts as c (user_id, window_start, count, bytes)
      select ${userId}, ${dayStart}::timestamptz, 1, ${bytes}::bigint
      where ${bytes}::bigint <= ${limits.bytesPerDay}::bigint
      on conflict (user_id, window_start) do update
        set count = c.count + 1, bytes = c.bytes + excluded.bytes
        where c.count < ${limits.perDay}::integer
          and c.bytes + excluded.bytes <= ${limits.bytesPerDay}::bigint
      returning 1
    )
    select count(*)::integer as counted from counted
  `;
  return Number(rows[0]?.counted) === 1;
}

/** This user's uploads so far in the day `now` falls in. */
export async function selectUploadUsage(userId: string, now: Date) {
  const rows = await db()`
    select count, bytes from receipt_upload_counts
    where user_id = ${userId}
      and window_start = ${uploadWindowStart(now).toISOString()}::timestamptz
  `;
  return {
    count: Number(rows[0]?.count ?? 0),
    bytes: Number(rows[0]?.bytes ?? 0),
  };
}
