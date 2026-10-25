import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { selectRecentMerchantChoices } from "@/db/merchant-memory";
import {
  buildMerchantMemory,
  MERCHANT_MEMORY_LIMIT,
  type MerchantMemory,
} from "@/lib/merchant-memory";

/**
 * The signed-in user's merchant → last-picked category map. Built only from
 * their own expenses; throws `UnauthorizedError` when signed out.
 */
export async function getMerchantMemory(): Promise<MerchantMemory> {
  const userId = await currentUserIdOrThrow();
  return buildMerchantMemory(
    await selectRecentMerchantChoices(userId, MERCHANT_MEMORY_LIMIT),
  );
}
