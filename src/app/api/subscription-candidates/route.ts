/**
 * Saved expenses that look like subscriptions or memberships, for the
 * Spending page's "Find subscriptions" dialog: `?month=YYYY-MM` and the few
 * months before it.
 *
 * A Route Handler (not a Server Action) because it is a read: the dialog
 * fetches it with TanStack Query when it opens, so the Spending page itself
 * does no extra work. The answer is the user's own data, so nothing in
 * between may keep a copy.
 */

import { UnauthorizedError } from "@/dal/errors";
import { getSubscriptionCandidates } from "@/dal/expense-bills";
import { currentMonth, isMonth } from "@/lib/month";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("month");
  const month = isMonth(asked) ? asked : currentMonth();
  try {
    const candidates = await getSubscriptionCandidates(month);
    return Response.json({ month, candidates }, { headers });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Sign in to see your subscriptions." },
        { status: 401, headers },
      );
    }
    throw error;
  }
}
