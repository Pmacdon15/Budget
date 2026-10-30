/**
 * The signed-in user's accounts for the expense form's "Paid from" picker, so
 * an expense is never taken off the wrong account when there's more than one.
 *
 * A Route Handler (not a Server Action) because it is a read: the form fetches
 * it with TanStack Query when it opens. The answer is the user's own data, so
 * nothing in between may keep a copy.
 */

import { getExpenseAccountOptions } from "@/dal/accounts";
import { UnauthorizedError } from "@/dal/errors";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const accounts = await getExpenseAccountOptions();
    return Response.json({ accounts }, { headers });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Sign in to see your accounts." },
        { status: 401, headers },
      );
    }
    throw error;
  }
}
