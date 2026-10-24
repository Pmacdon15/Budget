import type { ActionResult, FieldErrors } from "@/lib/types";

/** Thrown inside a mutation when a server action reports a failure. */
export class ActionError extends Error {
  readonly fieldErrors: FieldErrors;

  constructor(message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ActionError";
    this.fieldErrors = fieldErrors;
  }
}

/** Turns an action's result into a resolved mutation or a thrown `ActionError`. */
export function unwrap(result: ActionResult): void {
  if (!result.ok) throw new ActionError(result.error, result.fieldErrors);
}
