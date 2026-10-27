"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/expense-bills";
import {
  type ConvertSubscriptionsResult,
  type ConvertSubscriptionsValues,
  convertSubscriptionsSchema,
  type MakeFixedBillFormValues,
  makeFixedBillSchema,
} from "@/lib/schemas/expense-bills";
import type { ActionResult } from "@/lib/types";

/** The row's "Make fixed bill": a new bill, or a payment of one the user has. */
export async function makeExpenseFixedBill(values: MakeFixedBillFormValues) {
  return runAction(async () => {
    await dal.makeExpenseFixedBill(makeFixedBillSchema.parse(values));
  });
}

/** The bulk "Find subscriptions": converts the picked groups, and says how it went. */
export async function convertSubscriptions(
  values: ConvertSubscriptionsValues,
): Promise<ActionResult & { converted?: ConvertSubscriptionsResult }> {
  let converted: ConvertSubscriptionsResult | undefined;
  const result = await runAction(async () => {
    converted = await dal.convertSubscriptions(
      convertSubscriptionsSchema.parse(values),
    );
  });
  return result.ok ? { ...result, converted } : result;
}
