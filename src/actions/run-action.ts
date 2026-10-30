import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { currentUserIdOrThrow } from "@/dal/auth";
import { ConflictError, NotFoundError, UnauthorizedError } from "@/dal/errors";
import { userDataTag } from "@/db/cache-tags";
import type { ActionResult } from "@/lib/types";

/**
 * Runs a mutation for a server action: validation and DAL errors become an
 * `ActionResult` the client can show, and a success refreshes the app's data.
 */
export async function runAction(
  mutate: () => Promise<void>,
): Promise<ActionResult> {
  let userId: string;
  try {
    // Resolved before the write so a signed-out caller gets the usual
    // "not signed in" result, and so the tag below is always available.
    userId = await currentUserIdOrThrow();
    await mutate();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: error.issues[0]?.message ?? "Invalid input",
        fieldErrors: z.flattenError(error).fieldErrors,
      };
    }
    if (
      error instanceof UnauthorizedError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  // `revalidatePath` clears the route cache but not the `"use cache"` entries
  // in `src/db`, which are keyed by tag: without this the user would read
  // their own write back stale. `updateTag` (not `revalidateTag`) because the
  // next read must wait for fresh data rather than be served the old entry.
  updateTag(userDataTag(userId));
  revalidatePath("/", "layout");
  return { ok: true };
}
