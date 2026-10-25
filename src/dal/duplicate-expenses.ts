import "server-only";
import { currentUserIdOrThrow } from "@/dal/auth";
import { selectDuplicateExpense } from "@/db/duplicate-expenses";
import type { DuplicateCheck } from "@/lib/duplicate-expenses";

/** One of the signed-in user's saved expenses that looks like `check`, or null. */
export async function findDuplicateExpense(check: DuplicateCheck) {
  const userId = await currentUserIdOrThrow();
  return selectDuplicateExpense(userId, check);
}
