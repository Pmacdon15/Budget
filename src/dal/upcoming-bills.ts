import "server-only";
import { cache } from "react";
import { requireUserId } from "@/dal/auth";
import { selectFixedItems } from "@/db/fixed-items";
import { requestToday } from "@/lib/now";
import { type UpcomingBill, upcomingBills } from "@/lib/upcoming-bills";

/**
 * The signed-in user's bills due in the next 7 days, counted from today in
 * the app's time zone. Call it inside a Suspense hole, after the request.
 */
export const getUpcomingBills = cache(async (): Promise<UpcomingBill[]> => {
  const userId = await requireUserId();
  const items = await selectFixedItems(userId);
  return upcomingBills(items, await requestToday());
});
