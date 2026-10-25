"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { checkDuplicateExpense } from "@/actions/duplicate-expenses";
import { createExpense } from "@/actions/expenses";
import {
  type DuplicateExpense,
  duplicateKey,
  duplicateWarning,
} from "@/lib/duplicate-expenses";
import type { ExpenseFormValues } from "@/lib/schemas";
import { ActionError, unwrap } from "@/mutations/action-error";

/** Stops the first save of an expense that looks like one already saved. */
export class DuplicateExpenseError extends ActionError {
  constructor(readonly match: DuplicateExpense) {
    super(duplicateWarning(match));
    this.name = "DuplicateExpenseError";
  }
}

/**
 * Adds an expense, warning first when it looks like one already saved. The
 * warning is the mutation's error; submitting the same values again saves it
 * anyway, while changing them checks again.
 */
export function useAddExpenseWarningDuplicates() {
  const confirmed = useRef<string | null>(null);
  return useMutation<void, ActionError, ExpenseFormValues>({
    mutationKey: ["expenses", "create"],
    mutationFn: async (values) => {
      const key = duplicateKey(values);
      if (confirmed.current !== key) {
        let match: DuplicateExpense | null = null;
        try {
          match = await checkDuplicateExpense(values);
        } catch {
          // Only a warning: if the check fails, save as usual.
        }
        if (match) {
          confirmed.current = key;
          throw new DuplicateExpenseError(match);
        }
      }
      unwrap(await createExpense(values));
      confirmed.current = null;
    },
  });
}
