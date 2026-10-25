/**
 * Merchant memory for the expense form: which category the signed-in user
 * picked last time for each merchant, so it can be suggested next time.
 *
 * A Route Handler (not a Server Action) because it is a read: the form fetches
 * it with TanStack Query when it opens. The answer is the user's own data, so
 * nothing in between may keep a copy.
 */

import { UnauthorizedError } from "@/dal/errors";
import { getMerchantMemory } from "@/dal/merchant-memory";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const merchants = await getMerchantMemory();
    return Response.json({ merchants }, { headers });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Sign in to see your merchants." },
        { status: 401, headers },
      );
    }
    throw error;
  }
}
