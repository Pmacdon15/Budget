"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/income";
import { type IncomeFormValues, idSchema, incomeSchema } from "@/lib/schemas";

export async function createIncome(values: IncomeFormValues) {
  return runAction(async () => {
    const input = incomeSchema.parse(values);
    await dal.createIncome(input);
  });
}

export async function updateIncome(id: string, values: IncomeFormValues) {
  return runAction(async () => {
    const input = incomeSchema.parse(values);
    await dal.updateIncome(idSchema.parse(id), input);
  });
}

export async function deleteIncome(id: string) {
  return runAction(async () => {
    await dal.deleteIncome(idSchema.parse(id));
  });
}
