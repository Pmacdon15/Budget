"use client";

import { useMutation } from "@tanstack/react-query";
import { setCategoryBudgets } from "@/actions/category-budgets";
import type { CategoryBudgetsFormValues } from "@/lib/category-budgets";
import { type ActionError, unwrap } from "@/mutations/action-error";

export function useSetCategoryBudgets() {
  return useMutation<void, ActionError, CategoryBudgetsFormValues>({
    mutationKey: ["category-budgets", "set"],
    mutationFn: async (values) => unwrap(await setCategoryBudgets(values)),
  });
}
