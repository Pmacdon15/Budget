import "server-only";
import { db } from "@/db/client";
import {
  type ScanLimits,
  type ScanPeriod,
  scanWindows,
} from "@/lib/receipt-scan-limit";

/** Raw SQL for counting receipt scans. Callers (the DAL) handle auth. */

/**
 * Counts one scan against `userId`'s hour and day, in one statement, unless
 * either is already at its limit. Returns whether the scan was counted.
 *
 * The upserts only add when the stored count is under the limit, and Postgres
 * re-checks that against the latest row when two scans race, so concurrent
 * requests can't push a window past its limit (a scan refused that way may
 * still use up one of the hour's, which errs on the side of refusing).
 * Windows older than yesterday are pruned for this user on the way.
 */
export async function countScan(
  userId: string,
  now: Date,
  limits: ScanLimits,
): Promise<boolean> {
  const { hour, day } = scanWindows(now);
  const hourStart = hour.start.toISOString();
  const dayStart = day.start.toISOString();
  const rows = await db()`
    with current as (
      select
        coalesce(max(count) filter (where period = 'hour'), 0) as hour_count,
        coalesce(max(count) filter (where period = 'day'), 0) as day_count
      from receipt_scan_counts
      where user_id = ${userId}
        and ((period = 'hour' and window_start = ${hourStart}::timestamptz)
          or (period = 'day' and window_start = ${dayStart}::timestamptz))
    ),
    pruned as (
      delete from receipt_scan_counts
      where user_id = ${userId}
        and window_start < ${dayStart}::timestamptz - interval '1 day'
    ),
    counted as (
      insert into receipt_scan_counts as c (user_id, period, window_start, count)
      select ${userId}, w.period, w.window_start, 1
      from (values
        ('hour', ${hourStart}::timestamptz),
        ('day', ${dayStart}::timestamptz)
      ) as w (period, window_start), current
      where current.hour_count < ${limits.perHour}::integer
        and current.day_count < ${limits.perDay}::integer
      on conflict (user_id, period, window_start) do update
        set count = c.count + 1
        where c.count < case c.period
          when 'hour' then ${limits.perHour}::integer
          else ${limits.perDay}::integer
        end
      returning c.period
    )
    select count(*)::integer as counted from counted
  `;
  return Number(rows[0]?.counted) === 2;
}

/** This user's counts in the windows `now` falls in. */
export async function selectScanCounts(userId: string, now: Date) {
  const { hour, day } = scanWindows(now);
  const rows = await db()`
    select period, count from receipt_scan_counts
    where user_id = ${userId}
      and ((period = 'hour' and window_start = ${hour.start.toISOString()}::timestamptz)
        or (period = 'day' and window_start = ${day.start.toISOString()}::timestamptz))
  `;
  const count = (period: ScanPeriod) =>
    Number(rows.find((r) => r.period === period)?.count ?? 0);
  return { hour: count("hour"), day: count("day") };
}
