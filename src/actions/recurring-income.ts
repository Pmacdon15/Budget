"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/recurring-income";
import {
  type RecordRecurringIncomeFormValues,
  type RecurringIncomeFormValues,
  recordRecurringIncomeSchema,
  recurringIncomeSchema,
  recurringMonthSchema,
} from "@/lib/recurring-income";
import { idSchema, monthSchema } from "@/lib/schemas";

export async function createRecurringIncome(values: RecurringIncomeFormValues) {
  return runAction(async () => {
    await dal.createRecurringIncome(recurringIncomeSchema.parse(values));
  });
}

export async function updateRecurringIncome(
  id: string,
  values: RecurringIncomeFormValues,
) {
  return runAction(async () => {
    const input = recurringIncomeSchema.parse(values);
    await dal.updateRecurringIncome(idSchema.parse(id), input);
  });
}

export async function stopRecurringIncome(id: string, fromMonth: string) {
  return runAction(async () => {
    await dal.stopRecurringIncome(
      idSchema.parse(id),
      monthSchema.parse(fromMonth),
    );
  });
}

export async function recordRecurringIncome(
  values: RecordRecurringIncomeFormValues,
) {
  return runAction(async () => {
    await dal.recordRecurringIncome(recordRecurringIncomeSchema.parse(values));
  });
}

export async function skipRecurringIncome(values: {
  recurringId: string;
  month: string;
}) {
  return runAction(async () => {
    await dal.skipRecurringIncome(recurringMonthSchema.parse(values));
  });
}

export async function unskipRecurringIncome(values: {
  recurringId: string;
  month: string;
}) {
  return runAction(async () => {
    await dal.unskipRecurringIncome(recurringMonthSchema.parse(values));
  });
}
