"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/category-budgets";
import {
  type CategoryBudgetsFormValues,
  categoryBudgetsSchema,
} from "@/lib/category-budgets";

export async function setCategoryBudgets(values: CategoryBudgetsFormValues) {
  return runAction(async () => {
    await dal.setCategoryBudgets(categoryBudgetsSchema.parse(values));
  });
}
