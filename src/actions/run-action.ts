import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotFoundError, UnauthorizedError } from "@/dal/errors";
import type { ActionResult } from "@/lib/types";

/**
 * Runs a mutation for a server action: validation and DAL errors become an
 * `ActionResult` the client can show, and a success refreshes the app's data.
 */
export async function runAction(
  mutate: () => Promise<void>,
): Promise<ActionResult> {
  try {
    await mutate();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: error.issues[0]?.message ?? "Invalid input",
        fieldErrors: z.flattenError(error).fieldErrors,
      };
    }
    if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
